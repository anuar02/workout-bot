const OpenAI = require('openai');
const fs = require('fs');
const apiLogger = require('./apiLogger');
const chrono = require('chrono-node'); // npm install chrono-node

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class ParserService {
    async parseWorkout(text, context = null) {
        // Извлекаем дату если есть
        const dateInfo = this.extractDate(text);

        // Извлекаем заметки/самочувствие
        const notesInfo = this.extractNotes(text);

        const systemPrompt = `Ты парсишь описания тренировок. Извлеки из текста:
- exercise: название упражнения (на русском, нормализуй: "жим лёжа", "приседания", "тяга")
- sets: количество подходов (число)
- weight: вес в кг (число, без единиц)
- reps: количество повторений (число)

ВАЖНЫЕ ПРАВИЛА ПАРСИНГА:
1. "100 раз" = reps: 100, sets: null (не придумывай подходы!)
2. "3 подхода по 12" = sets: 3, reps: 12
3. "3х12" или "3*12" = sets: 3, reps: 12
4. "50кг" = weight: 50
5. Если не указаны подходы - ставь sets: null (не придумывай!)
6. Если указано только общее количество повторений без подходов - это reps, а sets = null

ПРИМЕРЫ:
"Приседания 100 раз по 20кг" → {"exercise":"приседания","sets":null,"weight":20,"reps":100}
"Жим 3 подхода по 50кг 12 раз" → {"exercise":"жим лёжа","sets":3,"weight":50,"reps":12}
"Тяга 80кг 5 подходов по 8" → {"exercise":"тяга","sets":5,"weight":80,"reps":8}

Игнорируй временные указания (вчера, сегодня) и самочувствие.
${context ? `\n\nКонтекст: последнее упражнение было "${context.exercise}"` : ''}

Ответь ТОЛЬКО валидным JSON без пояснений и markdown.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: text }
            ],
            temperature: 0.1,
            max_tokens: 150
        });

        const rawResponse = completion.choices[0].message.content.trim();
        const jsonString = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        const tokensUsed = completion.usage.total_tokens;
        const cost = (completion.usage.prompt_tokens * 0.150 + completion.usage.completion_tokens * 0.600) / 1000000;
        apiLogger.log('gpt-parse', cost, {
            tokens: tokensUsed,
            model: 'gpt-4o-mini'
        });

        const parsed = JSON.parse(jsonString);

        // Добавляем дату и заметки
        return {
            ...parsed,
            workoutDate: dateInfo.date,
            notes: notesInfo.notes,
            feeling: notesInfo.feeling
        };
    }

    extractDate(text) {
        const lowerText = text.toLowerCase();

        // Сегодня (по умолчанию)
        if (lowerText.includes('сегодня') || !lowerText.match(/вчера|позавчера|\d+\s*(день|дня|дней)\s*назад/)) {
            return { date: new Date(), label: 'сегодня' };
        }

        // Вчера
        if (lowerText.includes('вчера')) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            return { date: yesterday, label: 'вчера' };
        }

        // Позавчера
        if (lowerText.includes('позавчера')) {
            const dayBefore = new Date();
            dayBefore.setDate(dayBefore.getDate() - 2);
            return { date: dayBefore, label: 'позавчера' };
        }

        // N дней назад
        const daysAgoMatch = lowerText.match(/(\d+)\s*(день|дня|дней)\s*назад/);
        if (daysAgoMatch) {
            const daysAgo = parseInt(daysAgoMatch[1]);
            const date = new Date();
            date.setDate(date.getDate() - daysAgo);
            return { date, label: `${daysAgo} дней назад` };
        }

        // Используем chrono для сложных дат (14 января, в понедельник)
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

        // Самочувствие
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

        // Заметки (после "заметка:", "комментарий:", "примечание:")
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
