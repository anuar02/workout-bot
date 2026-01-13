const OpenAI = require('openai');
const fs = require('fs');
const apiLogger = require('./apiLogger');
const chrono = require('chrono-node');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class ParserService {
    async parseWorkout(text, context = null) {
        const dateInfo = this.extractDate(text);
        const notesInfo = this.extractNotes(text);

        const systemPrompt = `Ты парсишь описания тренировок. Извлеки ВСЕ упражнения и подходы из текста.

Верни массив JSON объектов. Каждый объект = ОДИН ПОДХОД одного упражнения:
{
  "exercise": "название упражнения на русском",
  "weight": число или null,
  "reps": число или null
}

ПРАВИЛА:
1. РАЗНЫЕ УПРАЖНЕНИЯ = разные объекты
   "Приседания 100кг 10 раз, жим 80кг 12 раз" → 2 объекта

2. ОДНО УПРАЖНЕНИЕ + РАЗНЫЙ ВЕС = несколько объектов
   "Жим 75кг 30р, 80кг 6р, 85кг 2р" → 3 объекта (exercise одинаковый!)

3. ОДНО УПРАЖНЕНИЕ + ОДИНАКОВЫЙ ВЕС = несколько объектов
   "Жим 80кг: 12 раз, 10 раз, 8 раз" → 3 объекта

4. БЕЗ ВЕСА допустимо: weight: null

5. НОРМАЛИЗАЦИЯ НАЗВАНИЙ:
   - "жим" → "жим лёжа"
   - "присед" → "приседания"
   - "тяга" → "становая тяга" (если не уточнено)
   - "подтягивания", "отжимания" → как есть

6. КОНТЕКСТ: если упражнение не указано явно, используй контекст
   ${context ? `(последнее упражнение: "${context.exercise}")` : ''}

ПРИМЕРЫ:

Input: "Жим лёжа 75кг 30 раз, 80кг 6 раз, 85кг 2 раза"
Output: [
  {"exercise":"жим лёжа","weight":75,"reps":30},
  {"exercise":"жим лёжа","weight":80,"reps":6},
  {"exercise":"жим лёжа","weight":85,"reps":2}
]

Input: "Приседания 100кг 10 раз, жим лёжа 80кг 12 раз"
Output: [
  {"exercise":"приседания","weight":100,"reps":10},
  {"exercise":"жим лёжа","weight":80,"reps":12}
]

Input: "Жим: 80кг-12р, 10р, 8р. Тяга: 90кг-8р"
Output: [
  {"exercise":"жим лёжа","weight":80,"reps":12},
  {"exercise":"жим лёжа","weight":80,"reps":10},
  {"exercise":"жим лёжа","weight":80,"reps":8},
  {"exercise":"становая тяга","weight":90,"reps":8}
]

Input: "10кг приседания, потом жим лёжа"
Output: [
  {"exercise":"приседания","weight":10,"reps":null},
  {"exercise":"жим лёжа","weight":null,"reps":null}
]

Input: "Подтягивания 10 раз, отжимания 20 раз"
Output: [
  {"exercise":"подтягивания","weight":null,"reps":10},
  {"exercise":"отжимания","weight":null,"reps":20}
]

Ответь ТОЛЬКО валидным JSON массивом без текста.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: text }
            ],
            temperature: 0.1,
            max_tokens: 800
        });

        const rawResponse = completion.choices[0].message.content.trim();

        // Извлекаем JSON
        let jsonString = rawResponse
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        // Ищем массив
        const firstBracket = jsonString.indexOf('[');
        const lastBracket = jsonString.lastIndexOf(']');

        if (firstBracket !== -1 && lastBracket !== -1) {
            jsonString = jsonString.substring(firstBracket, lastBracket + 1);
        } else {
            // Fallback: одиночный объект → оборачиваем в массив
            const firstBrace = jsonString.indexOf('{');
            const lastBrace = jsonString.lastIndexOf('}');

            if (firstBrace === -1 || lastBrace === -1) {
                console.error('❌ Не найден JSON:', rawResponse);
                throw new Error('Не смог распознать тренировку');
            }

            jsonString = '[' + jsonString.substring(firstBrace, lastBrace + 1) + ']';
        }

        // Логирование API
        const tokensUsed = completion.usage.total_tokens;
        const cost = (completion.usage.prompt_tokens * 0.150 + completion.usage.completion_tokens * 0.600) / 1000000;
        apiLogger.log('gpt-parse', cost, {
            tokens: tokensUsed,
            model: 'gpt-4o-mini',
            workoutsCount: '?'
        });

        // Парсим JSON
        let parsed;
        try {
            parsed = JSON.parse(jsonString);
        } catch (e) {
            console.error('❌ JSON parse error:', e.message);
            console.error('Raw:', rawResponse);
            console.error('Cleaned:', jsonString);
            throw new Error('Не смог распознать тренировку. Попробуй переформулировать!');
        }

        // Валидация и нормализация
        if (!Array.isArray(parsed)) {
            parsed = [parsed];
        }

        const workouts = parsed
            .filter(w => w.exercise && w.exercise.trim() !== '')
            .map(w => ({
                exercise: w.exercise.trim().toLowerCase(),
                weight: typeof w.weight === 'number' ? w.weight : null,
                reps: typeof w.reps === 'number' ? w.reps : null,
                sets: null, // Каждая запись = 1 подход
                workoutDate: dateInfo.date,
                dateLabel: dateInfo.label,
                notes: notesInfo.notes,
                feeling: notesInfo.feeling
            }));

        if (workouts.length === 0) {
            throw new Error('Не смог определить упражнение. Попробуй ещё раз!');
        }

        console.log(`✅ Распознано: ${workouts.length} подход(ов)`);
        return workouts;
    }

    extractDate(text) {
        const lowerText = text.toLowerCase();

        if (lowerText.includes('сегодня') || !lowerText.match(/вчера|позавчера|\d+\s*(день|дня|дней)\s*назад/)) {
            return { date: new Date(), label: 'сегодня' };
        }

        if (lowerText.includes('вчера')) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            return { date: yesterday, label: 'вчера' };
        }

        if (lowerText.includes('позавчера')) {
            const dayBefore = new Date();
            dayBefore.setDate(dayBefore.getDate() - 2);
            return { date: dayBefore, label: 'позавчера' };
        }

        const daysAgoMatch = lowerText.match(/(\d+)\s*(день|дня|дней)\s*назад/);
        if (daysAgoMatch) {
            const daysAgo = parseInt(daysAgoMatch[1]);
            const date = new Date();
            date.setDate(date.getDate() - daysAgo);
            return { date, label: `${daysAgo} дней назад` };
        }

        const parsed = chrono.ru.parseDate(text);
        if (parsed) {
            return { date: parsed, label: parsed.toLocaleDateString('ru-RU') };
        }

        return { date: new Date(), label: 'сегодня' };
    }

    extractNotes(text) {
        const lowerText = text.toLowerCase();
        let notes = null;
        let feeling = null;

        if (lowerText.includes('отлично') || lowerText.includes('легко')) {
            feeling = 'отлично';
        } else if (lowerText.includes('хорошо')) {
            feeling = 'хорошо';
        } else if (lowerText.includes('нормально') || lowerText.includes('средне')) {
            feeling = 'нормально';
        } else if (lowerText.includes('тяжело') || lowerText.includes('сложно')) {
            feeling = 'тяжело';
        } else if (lowerText.includes('плохо') || lowerText.includes('болит')) {
            feeling = 'плохо';
        }

        const notesMatch = text.match(/(?:заметка|комментарий|примечание|ps|п\.с\.)[:\s](.+)/i);
        if (notesMatch) {
            notes = notesMatch[1].trim();
        }

        return { notes, feeling };
    }

    async transcribe(filePath) {
        try {
            const stats = fs.statSync(filePath);
            const fileSizeKB = stats.size / 1024;

            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(filePath),
                model: "whisper-1",
                language: "ru"
            });

            const estimatedMinutes = fileSizeKB / 1024;
            const cost = estimatedMinutes * 0.006;
            apiLogger.log('whisper', cost, {
                fileSizeKB: fileSizeKB.toFixed(2),
                estimatedMinutes: estimatedMinutes.toFixed(2)
            });

            return transcription.text;

        } catch (error) {
            console.error('❌ Ошибка транскрибации:', error.message);
            throw error;
        }
    }
}

module.exports = new ParserService();
