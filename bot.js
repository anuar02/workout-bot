const AWAITING_TIMEOUT = 5 * 60 * 1000; // 5 минут

// Функция для установки ожидания с таймаутом
function setAwaitingInput(chatId, inputData) {
    // Очищаем предыдущий таймер если есть
    if (awaitingInput[chatId]?.timeout) {
        clearTimeout(awaitingInput[chatId].timeout);
    }

    // Устанавливаем новое ожидание с таймером
    awaitingInput[chatId] = {
        ...inputData,
        timeout: setTimeout(() => {
            if (awaitingInput[chatId]) {
                bot.sendMessage(chatId, '⏱️ Время ожидания истекло. Начни заново.');
                delete awaitingInput[chatId]; // ← ПРАВИЛЬНО
            }
        }, AWAITING_TIMEOUT)
    };
}

// Функция для очистки ожидания
function clearAwaitingInput(chatId) {
    if (awaitingInput[chatId]?.timeout) {
        clearTimeout(awaitingInput[chatId].timeout);
    }
    delete awaitingInput[chatId]; // ← ПРАВИЛЬНО
}

const userRequestCounts = {};
const RATE_LIMIT = 30; // запросов в минуту
const RATE_WINDOW = 60 * 1000; // 1 минута


function checkRateLimit(telegramId) {
    const now = Date.now();

    if (!userRequestCounts[telegramId]) {
        userRequestCounts[telegramId] = { count: 0, resetAt: now + RATE_WINDOW };
    }

    const userLimit = userRequestCounts[telegramId];

    // Сброс счётчика если прошла минута
    if (now > userLimit.resetAt) {
        userLimit.count = 0;
        userLimit.resetAt = now + RATE_WINDOW;
    }

    userLimit.count++;

    if (userLimit.count > RATE_LIMIT) {
        return false; // превышен лимит
    }

    return true;
}


require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const apiLogger = require('./services/apiLogger');
const OpenAI = require('openai');
const openai = new (require('openai'))({ apiKey: process.env.OPENAI_API_KEY });

// Модели
const User = require('./models/User');
const Workout = require('./models/Workout');

// Сервисы
const parserService = require('./services/parser');
const statsService = require('./services/stats');
const chartGenerator = require('./utils/chartGenerator');
const exportService = require('./services/export');

// Инициализация бота
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Подключение к MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB подключена'))
    .catch(err => console.error('❌ Ошибка MongoDB:', err));

console.log('🤖 Бот запущен!');

// Хранилище контекста
const userContext = {};

// Очистка старых экспортов каждый час
setInterval(() => {
    exportService.cleanupOldFiles();
}, 60 * 60 * 1000);

// ========== КОМАНДЫ ==========

// /start - Регистрация
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
        let user = await User.findOne({ telegramId });

        if (!user) {
            console.log(`📝 Новый пользователь: ${msg.from.username || msg.from.first_name}`);

            user = new User({
                telegramId,
                username: msg.from.username,
                firstName: msg.from.first_name,
                lastName: msg.from.last_name
            });

            await user.save();

            await bot.sendMessage(chatId,
                `🎉 Добро пожаловать, ${msg.from.first_name}!\n\n` +
                `💪 Отправь голосовое сообщение с описанием тренировки!\n\n` +
                `Например: "Жим лёжа три подхода по 50 кг, 12 повторений"\n\n` +
                `📋 Команды:\n` +
                `/stats - статистика\n` +
                `/progress упражнение - график прогресса\n` +
                `/top - топ упражнений\n` +
                `/export - скачать все тренировки (Excel)\n` +
                `/help - помощь`
            );
        } else {
            await bot.sendMessage(chatId,
                `👋 С возвращением, ${msg.from.first_name}!\n\n` +
                `💪 Всего тренировок: ${user.stats.totalWorkouts}\n\n` +
                `Отправь голосовое или используй команды:\n` +
                `/stats /progress /export /top`
            );
        }

        user.lastActive = new Date();
        await user.save();

    } catch (error) {
        console.error('❌ Ошибка /start:', error);
        await bot.sendMessage(chatId, '😕 Ошибка при регистрации. Попробуй ещё раз.');
    }
});

bot.onText(/\/costs/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const stats = apiLogger.getStats();
        const today = apiLogger.getTodayStats();

        if (stats.logs.length === 0) {
            return await bot.sendMessage(chatId, '💰 Пока нет данных о расходах API');
        }

        // Группируем по типам
        const byType = {};
        stats.logs.forEach(log => {
            if (!byType[log.type]) {
                byType[log.type] = { count: 0, cost: 0 };
            }
            byType[log.type].count++;
            byType[log.type].cost += log.cost;
        });

        let message = `💰 *Статистика расходов API*\n\n`;
        message += `*За всё время:*\n`;
        message += `Всего вызовов: ${stats.logs.length}\n`;
        message += `Общая стоимость: $${stats.totalCost.toFixed(4)}\n\n`;

        message += `*Сегодня:*\n`;
        message += `Вызовов: ${today.calls}\n`;
        message += `Стоимость: $${today.cost.toFixed(4)}\n\n`;

        message += `*По типам:*\n`;
        Object.entries(byType).forEach(([type, data]) => {
            const avgCost = data.cost / data.count;
            message += `• ${type}: ${data.count} вызовов ($${data.cost.toFixed(4)}, ~$${avgCost.toFixed(6)} за вызов)\n`;
        });

        // Средняя стоимость на запись
        message += `\n*Средняя стоимость записи тренировки:* $${(stats.totalCost / (byType['whisper']?.count || 1)).toFixed(6)}`;

        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('❌ Ошибка /costs:', error);
        await bot.sendMessage(chatId, '😕 Ошибка при получении статистики расходов.');
    }
});

// /export - Экспорт данных
bot.onText(/\/export( (excel|csv))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const format = match[2] || 'excel';

    try {
        const user = await User.findOne({ telegramId });
        if (!user) {
            return await bot.sendMessage(chatId, '⚠️ Сначала нажми /start');
        }

        await bot.sendChatAction(chatId, 'upload_document');
        await bot.sendMessage(chatId, '📦 Готовлю экспорт...');

        let filepath;
        let caption;

        if (format === 'csv') {
            filepath = await exportService.exportToCSV(
                telegramId,
                user.username || user.firstName
            );
            caption = '📄 Твои тренировки в CSV формате';
        } else {
            filepath = await exportService.exportToExcel(
                telegramId,
                user.username || user.firstName
            );
            caption = '📊 Твои тренировки в Excel формате';
        }

        // Отправляем файл
        await bot.sendDocument(chatId, filepath, {
            caption: caption
        });

        // Удаляем временный файл через 5 секунд
        setTimeout(() => {
            exportService.cleanupFile(filepath);
        }, 5000);

    } catch (error) {
        console.error('❌ Ошибка /export:', error);

        if (error.message === 'Нет данных для экспорта') {
            await bot.sendMessage(chatId, '📭 У тебя пока нет записанных тренировок!');
        } else {
            await bot.sendMessage(chatId, '😕 Ошибка при создании экспорта.');
        }
    }
});

// /stats - Статистика
bot.onText(/\/stats( (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const period = match[2] || 'week';

    try {
        await bot.sendChatAction(chatId, 'typing');

        const stats = await statsService.getStats(telegramId, period);

        if (stats.totalWorkouts === 0) {
            return await bot.sendMessage(chatId, '📊 Пока нет тренировок. Начни записывать!');
        }

        let message = `📊 *Статистика за ${getPeriodName(period)}*\n\n`;
        message += `🏋️ Всего тренировок: ${stats.totalWorkouts}\n`;
        message += `💪 Общий объём: ${stats.totalVolume.toLocaleString()} кг\n\n`;
        message += `*Топ упражнений:*\n`;

        const topExercises = Object.entries(stats.exercises)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5);

        topExercises.forEach(([name, data], i) => {
            message += `${i + 1}. ${name}\n`;
            message += `   └ ${data.count} тренировок, макс ${data.maxWeight}кг\n`;
        });

        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

        // Генерируем график
        await bot.sendChatAction(chatId, 'upload_photo');
        const chart = await chartGenerator.generateVolumeChart(stats);
        await bot.sendPhoto(chatId, chart, {
            caption: `📈 Объём тренировок за ${getPeriodName(period)}`
        });

    } catch (error) {
        console.error('❌ Ошибка /stats:', error);
        await bot.sendMessage(chatId, '😕 Ошибка при получении статистики.');
    }
});

// /progress - Прогресс по упражнению
bot.onText(/\/progress( (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const exercise = match[2];

    if (!exercise) {
        return await bot.sendMessage(chatId,
            '📈 Укажи упражнение:\n/progress жим лёжа'
        );
    }

    try {
        await bot.sendChatAction(chatId, 'typing');

        const progress = await statsService.getProgress(telegramId, exercise, 30);

        if (progress.workouts === 0) {
            return await bot.sendMessage(chatId,
                `📈 Нет данных по упражнению "${exercise}"`
            );
        }

        await bot.sendChatAction(chatId, 'upload_photo');
        const chart = await chartGenerator.generateProgressChart(progress);
        await bot.sendPhoto(chatId, chart, {
            caption: `📈 Прогресс: ${exercise}\nТренировок за 30 дней: ${progress.workouts}`
        });

    } catch (error) {
        console.error('❌ Ошибка /progress:', error);
        await bot.sendMessage(chatId, '😕 Ошибка при получении прогресса.');
    }
});

// /top - Топ упражнений
bot.onText(/\/top/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
        const top = await statsService.getTopExercises(telegramId);

        if (top.length === 0) {
            return await bot.sendMessage(chatId, '🏆 Пока нет тренировок.');
        }

        let message = '🏆 *Топ-5 упражнений:*\n\n';

        top.forEach((item, i) => {
            const emoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i];
            message += `${emoji} *${item._id}*\n`;
            message += `   └ ${item.count} тренировок, ${item.totalVolume.toLocaleString()} кг объём\n`;
            message += `   └ Макс вес: ${item.maxWeight}кг\n\n`;
        });

        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('❌ Ошибка /top:', error);
        await bot.sendMessage(chatId, '😕 Ошибка при получении топа.');
    }
});

// /delete - Удалить последнюю тренировку
bot.onText(/\/delete/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
        const lastWorkout = await Workout.findOne({ telegramId })
            .sort({ createdAt: -1 });

        if (!lastWorkout) {
            return await bot.sendMessage(chatId, '❌ Нет тренировок для удаления');
        }

        await Workout.deleteOne({ _id: lastWorkout._id });

        // Обновляем статистику пользователя
        const user = await User.findOne({ telegramId });
        if (user) {
            user.stats.totalWorkouts = Math.max(0, user.stats.totalWorkouts - 1);
            await user.save();
        }

        await bot.sendMessage(chatId,
            `🗑️ Удалена последняя тренировка:\n` +
            `${lastWorkout.exercise} - ${lastWorkout.sets}х${lastWorkout.reps}х${lastWorkout.weight}кг`
        );

    } catch (error) {
        console.error('❌ Ошибка /delete:', error);
        await bot.sendMessage(chatId, '😕 Ошибка при удалении.');
    }
});

// /help - Помощь
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;

    const helpText = `
🤖 *Как пользоваться ботом:*

*Запись тренировок:*
Отправь голосовое или текст:
- "Жим лёжа 3 подхода по 50кг 12 раз"
- "Присед сотку на 5 три сета"
- "Ещё два подхода" (продолжит предыдущее)

*Команды:*
/stats [period] - статистика
/progress упражнение - график прогресса
/top - топ-5 упражнений
/export - скачать данные (Excel)
/delete - удалить последнюю запись
/costs - расходы на API
/help - эта справка
  `;

    await bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
});

// ========== ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ ==========

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    // Игнорируем не текстовые сообщения
    if (!msg.text) return;

    // Игнорируем команды (они обрабатываются отдельно)
    if (msg.text.startsWith('/')) return;

    // ✅ ПРИОРИТЕТ 1: Проверяем ожидаемый ввод (заметки, даты, редактирование)
    if (awaitingInput[chatId]) {
        const input = awaitingInput[chatId];

        try {
            // Добавление заметки
            if (input.type === 'note') {
                await Workout.findByIdAndUpdate(input.workoutId, { notes: msg.text });
                await bot.sendMessage(chatId, `✅ Заметка сохранена: "${msg.text}"`);
                clearAwaitingInput(chatId);
                return; // ← ВАЖНО: выходим, не обрабатываем дальше
            }

            // Изменение даты
            else if (input.type === 'date') {
                const chrono = require('chrono-node');
                const parsed = chrono.ru.parseDate(msg.text) || new Date();

                await Workout.findByIdAndUpdate(input.workoutId, { workoutDate: parsed });
                await bot.sendMessage(chatId,
                    `✅ Дата изменена на ${parsed.toLocaleDateString('ru-RU')}`
                );
                clearAwaitingInput(chatId);
                return; // ← ВАЖНО
            }

            // Редактирование
            else if (input.type === 'edit') {
                const parsed = await parserService.parseWorkout(msg.text);

                if (!parsed.exercise) {
                    await bot.sendMessage(chatId, '❌ Не смог определить упражнение. Попробуй ещё раз.');
                    return;
                }

                await Workout.findByIdAndUpdate(input.workoutId, {
                    exercise: parsed.exercise,
                    sets: parsed.sets,
                    weight: parsed.weight,
                    reps: parsed.reps
                });

                const volume = (parsed.sets || 0) * (parsed.reps || 0) * (parsed.weight || 0);

                await bot.sendMessage(chatId,
                    `✅ Тренировка обновлена!\n\n` +
                    `📋 ${parsed.exercise}\n` +
                    `🔢 ${parsed.sets || '-'} подходов\n` +
                    `⚖️ ${parsed.weight || '-'} кг\n` +
                    `🔁 ${parsed.reps || '-'} повторений\n` +
                    `💪 Объём: ${volume > 0 ? volume.toLocaleString() + ' кг' : '-'}`
                );
                clearAwaitingInput(chatId);
                return; // ← ВАЖНО
            }

        } catch (error) {
            console.error('❌ Ошибка обработки ввода:', error);
            await bot.sendMessage(chatId, '😕 Ошибка. Попробуй ещё раз.');
            clearAwaitingInput(chatId);
            return;
        }
    }

    // ✅ ПРИОРИТЕТ 2: Обработка тренировок и обычных сообщений
    try {
        const user = await User.findOne({ telegramId });
        if (!user) {
            return await bot.sendMessage(chatId,
                '⚠️ Сначала нажми /start для регистрации!'
            );
        }

        const text = msg.text.trim();

        // Проверяем - это описание тренировки или вопрос?
        const isWorkoutDescription = await detectWorkoutIntent(text);

        if (isWorkoutDescription) {
            // Обрабатываем как тренировку
            await processWorkoutText(msg, user, text);
        } else {
            // Это вопрос или общение
            await handleChatMessage(msg, text);
        }

    } catch (error) {
        console.error('❌ Ошибка обработки текста:', error);
        await bot.sendMessage(chatId, '😕 Что-то пошло не так. Попробуй ещё раз.');
    }
});

// Определяем намерение пользователя
async function detectWorkoutIntent(text) {
    // Ключевые слова тренировок
    const workoutKeywords = [
        'жим', 'присед', 'тяга', 'подтягивание', 'отжимание',
        'подход', 'сет', 'повторени', 'раз', 'кг', 'килограмм',
        'сделал', 'выполнил', 'тренировка', 'упражнение'
    ];

    const lowerText = text.toLowerCase();

    // Проверяем наличие ключевых слов
    const hasWorkoutKeywords = workoutKeywords.some(keyword =>
        lowerText.includes(keyword)
    );

    // Проверяем паттерны типа "3x12x50"
    const hasWorkoutPattern = /\d+\s*[xх]\s*\d+/.test(lowerText);

    // Если есть хоть один признак тренировки - обрабатываем как тренировку
    if (hasWorkoutKeywords || hasWorkoutPattern) {
        return true;
    }

    // Если текст очень короткий и похож на вопрос - это не тренировка
    const questionWords = ['что', 'как', 'почему', 'когда', 'зачем', 'где', 'кто', 'напиши', 'расскажи', 'объясни'];
    const hasQuestionWords = questionWords.some(word => lowerText.startsWith(word));

    if (hasQuestionWords) {
        return false;
    }

    // По умолчанию для коротких текстов - используем AI для определения
    if (text.length < 100) {
        return await detectIntentWithAI(text);
    }

    return false;
}

// AI определение намерения (для сложных случаев)
async function detectIntentWithAI(text) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "system",
                content: `Определи: это описание тренировки или обычный вопрос/сообщение?
Ответь ТОЛЬКО одним словом: "workout" или "chat"`
            }, {
                role: "user",
                content: text
            }],
            temperature: 0,
            max_tokens: 10
        });

        const intent = response.choices[0].message.content.trim().toLowerCase();

        // ✅ ЛОГИРУЕМ INTENT DETECTION
        const tokensUsed = response.usage.total_tokens;
        const cost = (response.usage.prompt_tokens * 0.150 + response.usage.completion_tokens * 0.600) / 1000000;
        apiLogger.log('gpt-intent', cost, {
            tokens: tokensUsed,
            intent
        });

        return intent === 'workout';

    } catch (error) {
        console.error('❌ Ошибка определения намерения:', error);
        return true; // По умолчанию считаем что это тренировка
    }
}

// Обработка текстовой тренировки
async function processWorkoutText(msg, user, text) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
        await bot.sendChatAction(chatId, 'typing');
        console.log(`📝 Текст тренировки от ${msg.from.username || msg.from.first_name}: ${text}`);

        const context = userContext[telegramId];
        const parsed = await parserService.parseWorkout(text, context);
        console.log('✅ Распарсили:', parsed);

        if (!parsed.exercise && context) {
            parsed.exercise = context.exercise;
        }

        if (!parsed.exercise) {
            return await bot.sendMessage(chatId,
                '🤔 Не смог определить упражнение.\n\n' +
                'Попробуй так: "Жим лёжа 3 подхода по 50кг 12 раз"\n' +
                'Или отправь голосовое сообщение 🎤'
            );
        }

        // Сохраняем в MongoDB
        const workout = new Workout({
            userId: user._id,
            telegramId,
            exercise: parsed.exercise,
            sets: parsed.sets,
            weight: parsed.weight,
            reps: parsed.reps,
            workoutDate: parsed.workoutDate || new Date(),
            notes: parsed.notes,
            feeling: parsed.feeling,
            transcription: text
        });

        await workout.save();
        console.log('💾 Сохранено в MongoDB');

        user.stats.totalWorkouts++;
        user.stats.monthlyWorkouts++;
        user.stats.lastWorkoutDate = new Date();
        user.lastActive = new Date();
        await user.save();

        userContext[telegramId] = parsed;

        // Подтверждение
        const volume = (parsed.sets || 1) * (parsed.reps || 0) * (parsed.weight || 0);
        const dateLabel = parsed.workoutDate ? new Date(parsed.workoutDate).toLocaleDateString('ru-RU') : 'сегодня';

        let setsRepsText = '';
        if (parsed.sets && parsed.reps) {
            setsRepsText = `${parsed.sets} подходов × ${parsed.reps} повторений`;
        } else if (parsed.reps && !parsed.sets) {
            setsRepsText = `${parsed.reps} повторений (1 подход)`;
        } else if (parsed.sets && !parsed.reps) {
            setsRepsText = `${parsed.sets} подходов`;
        } else {
            setsRepsText = 'не указано';
        }

        const confirmMessage = `✅ *Записал!*\n\n` +
            `📅 Дата: ${dateLabel}\n` +
            `📋 Упражнение: ${parsed.exercise}\n` +
            `📝 Описание: ${setsRepsText}` +
            (parsed.weight ? `\n⚖️ Вес: ${parsed.weight} кг` : '') +
            `\n💪 Объём: ${volume > 0 ? volume.toLocaleString() + ' кг' : '-'}\n` +
            (parsed.feeling ? `😊 Самочувствие: ${parsed.feeling}\n` : '') +
            (parsed.notes ? `📝 Заметка: ${parsed.notes}\n` : '') +
            `\n📊 Всего тренировок: ${user.stats.totalWorkouts}`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✏️ Добавить заметку', callback_data: `add_note_${workout._id}` },
                    { text: '😊 Самочувствие', callback_data: `add_feeling_${workout._id}` }
                ],
                [
                    { text: '📅 Изменить дату', callback_data: `change_date_${workout._id}` },
                    { text: '✏️ Редактировать', callback_data: `edit_${workout._id}` }
                ],
                [
                    { text: '🗑️ Удалить', callback_data: `delete_${workout._id}` }
                ]
            ]
        };

        await bot.sendMessage(chatId, confirmMessage, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });

    } catch (error) {
        console.error('❌ Ошибка обработки текста:', error);
        await bot.sendMessage(chatId,
            '😕 Не смог обработать. Попробуй переформулировать или используй голосовое сообщение.'
        );
    }
}

// Обработка обычного чата (вопросы/общение)
async function handleChatMessage(msg, text) {
    const chatId = msg.chat.id;

    // Варианты ответа в зависимости от типа вопроса
    const lowerText = text.toLowerCase();

    // Вопросы о боте
    if (lowerText.includes('как') && (lowerText.includes('работа') || lowerText.includes('пользоваться'))) {
        return await bot.sendMessage(chatId,
            `🤖 Я помогаю записывать твои тренировки!\n\n` +
            `Просто отправь голосовое или напиши:\n` +
            `"Жим лёжа 3 подхода по 50кг 12 раз"\n\n` +
            `Команды: /help`
        );
    }

    // Общие вопросы про тренировки
    if (lowerText.includes('программ') || lowerText.includes('план')) {
        return await bot.sendMessage(chatId,
            `💪 Я пока умею только записывать твои тренировки.\n\n` +
            `Для программ и планов лучше обратиться к тренеру или использовать специализированные приложения!\n\n` +
            `Но я могу показать твою статистику: /stats`
        );
    }

    // Вопросы про технику
    if (lowerText.includes('техник') || lowerText.includes('правильно выполн')) {
        return await bot.sendMessage(chatId,
            `🏋️ Для вопросов о технике упражнений лучше проконсультироваться с тренером!\n\n` +
            `Я специализируюсь на учёте тренировок. Хочешь записать тренировку?`
        );
    }

    // Программирование и другие не по теме вопросы
    if (lowerText.includes('напиши') || lowerText.includes('код') || lowerText.includes('алгоритм')) {
        return await bot.sendMessage(chatId,
            `🤖 Я бот для учёта тренировок, не программист 😊\n\n` +
            `Для таких вопросов попробуй ChatGPT или Claude!\n\n` +
            `А я могу помочь записать твою тренировку. Отправь голосовое или напиши упражнение!`
        );
    }

    // Общее приветствие
    if (lowerText.includes('привет') || lowerText.includes('здравству')) {
        return await bot.sendMessage(chatId,
            `👋 Привет! Готов записать тренировку?\n\n` +
            `Отправь голосовое или напиши текстом!\n` +
            `Команды: /help`
        );
    }

    // Любой другой вопрос
    await bot.sendMessage(chatId,
        `Я бот для учёта тренировок 💪\n\n` +
        `Умею:\n` +
        `✅ Записывать тренировки (голосом или текстом)\n` +
        `✅ Показывать статистику (/stats)\n` +
        `✅ Строить графики прогресса (/progress)\n` +
        `✅ Экспортировать данные (/export)\n\n` +
        `Хочешь записать тренировку?`
    );
}

// ========== ОБРАБОТКА ГОЛОСА ==========

// ========== ОБРАБОТКА ГОЛОСА ==========

bot.on('voice', async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const fileId = msg.voice.file_id;

    try {
        const user = await User.findOne({ telegramId });
        if (!user) {
            return await bot.sendMessage(chatId,
                '⚠️ Сначала нажми /start для регистрации!'
            );
        }

        await bot.sendChatAction(chatId, 'typing');
        console.log(`📥 Войс от ${msg.from.username || msg.from.first_name}`);

        // 1. Скачиваем голосовое
        const file = await bot.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

        const response = await axios({
            method: 'get',
            url: fileUrl,
            responseType: 'stream'
        });

        const tempFilePath = path.join(__dirname, `voice_${Date.now()}.ogg`);
        const writer = fs.createWriteStream(tempFilePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // 2. Транскрибация
        const text = await parserService.transcribe(tempFilePath);
        console.log('🎤 Транскрипция:', text);

        fs.unlinkSync(tempFilePath);

        // ✅ НОВОЕ: Проверяем намерение
        const isWorkoutDescription = await detectWorkoutIntent(text);

        if (!isWorkoutDescription) {
            // Это не тренировка - обрабатываем как обычное сообщение
            console.log('💬 Голосовое - обычное сообщение, не тренировка');
            return await handleChatMessage({ chat: { id: chatId } }, text);
        }

        // 3. Парсинг с контекстом
        const context = userContext[telegramId];
        const parsed = await parserService.parseWorkout(text, context);
        console.log('✅ Распарсили:', parsed);

        if (!parsed.exercise && context) {
            parsed.exercise = context.exercise;
        }

        if (!parsed.exercise) {
            throw new Error('Не смог определить упражнение. Попробуй ещё раз!');
        }

        // 4. Сохраняем в MongoDB
        const workout = new Workout({
            userId: user._id,
            telegramId,
            exercise: parsed.exercise,
            sets: parsed.sets,
            weight: parsed.weight,
            reps: parsed.reps,
            transcription: text,
            voiceDuration: msg.voice.duration
        });

        await workout.save();
        console.log('💾 Сохранено в MongoDB');

        // 5. Обновляем статистику пользователя
        user.stats.totalWorkouts++;
        user.stats.monthlyWorkouts++;
        user.stats.lastWorkoutDate = new Date();
        user.lastActive = new Date();
        await user.save();

        // 6. Сохраняем контекст
        userContext[telegramId] = parsed;

        // 7. Подтверждение
        const volume = (parsed.sets || 0) * (parsed.reps || 0) * (parsed.weight || 0);
        const dateLabel = parsed.workoutDate ? new Date(parsed.workoutDate).toLocaleDateString('ru-RU') : 'сегодня';

        let setsRepsText = '';
        if (parsed.sets && parsed.reps) {
            setsRepsText = `${parsed.sets} подходов × ${parsed.reps} повторений`;
        } else if (parsed.reps && !parsed.sets) {
            setsRepsText = `${parsed.reps} повторений (1 подход)`;
        } else if (parsed.sets && !parsed.reps) {
            setsRepsText = `${parsed.sets} подходов`;
        } else {
            setsRepsText = 'не указано';
        }

        const confirmMessage = `✅ *Записал!*\n\n` +
            `📅 Дата: ${dateLabel}\n` +
            `📋 Упражнение: ${parsed.exercise}\n` +
            `📝 Описание: ${setsRepsText}` +
            (parsed.weight ? `\n⚖️ Вес: ${parsed.weight} кг` : '') +
            `\n💪 Объём: ${volume > 0 ? volume.toLocaleString() + ' кг' : '-'}\n` +
            (parsed.feeling ? `😊 Самочувствие: ${parsed.feeling}\n` : '') +
            (parsed.notes ? `📝 Заметка: ${parsed.notes}\n` : '') +
            `\n📊 Всего тренировок: ${user.stats.totalWorkouts}`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✏️ Добавить заметку', callback_data: `add_note_${workout._id}` },
                    { text: '😊 Самочувствие', callback_data: `add_feeling_${workout._id}` }
                ],
                [
                    { text: '📅 Изменить дату', callback_data: `change_date_${workout._id}` },
                    { text: '✏️ Редактировать', callback_data: `edit_${workout._id}` }
                ],
                [
                    { text: '🗑️ Удалить', callback_data: `delete_${workout._id}` }
                ]
            ]
        };

        await bot.sendMessage(chatId, confirmMessage, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });

    } catch (error) {
        console.error('❌ Ошибка обработки войса:', error);
        await bot.sendMessage(chatId,
            `😕 ${error.message || 'Что-то пошло не так. Попробуй ещё раз!'}`
        );
    }
});
// ========== ОБРАБОТЧИКИ INLINE КНОПОК ==========

// Хранилище для ожидания ввода
const awaitingInput = {};

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    try {
        // Добавить заметку
        if (data.startsWith('add_note_')) {
            const workoutId = data.replace('add_note_', '');
            setAwaitingInput(chatId, { type: 'note', workoutId });

            await bot.answerCallbackQuery(query.id);
            await bot.sendMessage(chatId, '📝 Напиши заметку к тренировке:');
        }

        // Добавить самочувствие
        else if (data.startsWith('add_feeling_')) {
            const workoutId = data.replace('add_feeling_', '');

            const feelingKeyboard = {
                inline_keyboard: [
                    [
                        { text: '😄 Отлично', callback_data: `feeling_${workoutId}_отлично` },
                        { text: '🙂 Хорошо', callback_data: `feeling_${workoutId}_хорошо` }
                    ],
                    [
                        { text: '😐 Нормально', callback_data: `feeling_${workoutId}_нормально` },
                        { text: '😓 Тяжело', callback_data: `feeling_${workoutId}_тяжело` }
                    ],
                    [
                        { text: '😢 Плохо', callback_data: `feeling_${workoutId}_плохо` }
                    ]
                ]
            };

            await bot.answerCallbackQuery(query.id);
            await bot.sendMessage(chatId, '😊 Как себя чувствовал на тренировке?', {
                reply_markup: feelingKeyboard
            });
        }

        // Сохранение самочувствия
        else if (data.startsWith('feeling_')) {
            const parts = data.split('_');
            const workoutId = parts[1];
            const feeling = parts[2];

            await Workout.findByIdAndUpdate(workoutId, { feeling });

            await bot.answerCallbackQuery(query.id, { text: '✅ Самочувствие сохранено!' });
            await bot.editMessageText(
                query.message.text + `\n😊 Самочувствие: ${feeling}`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown'
                }
            );
        }

        // Изменить дату
        else if (data.startsWith('change_date_')) {
            const workoutId = data.replace('change_date_', '');

            const dateKeyboard = {
                inline_keyboard: [
                    [
                        { text: '📅 Сегодня', callback_data: `date_${workoutId}_0` },
                        { text: '📅 Вчера', callback_data: `date_${workoutId}_1` }
                    ],
                    [
                        { text: '📅 Позавчера', callback_data: `date_${workoutId}_2` },
                        { text: '📅 3 дня назад', callback_data: `date_${workoutId}_3` }
                    ],
                    [
                        { text: '✏️ Другая дата', callback_data: `date_custom_${workoutId}` }
                    ]
                ]
            };

            await bot.answerCallbackQuery(query.id);
            await bot.sendMessage(chatId, '📅 Когда была тренировка?', {
                reply_markup: dateKeyboard
            });
        }

        // Установка даты
        else if (data.startsWith('date_')) {
            const parts = data.split('_');
            const workoutId = parts[1];
            const daysAgo = parseInt(parts[2]);

            const date = new Date();
            date.setDate(date.getDate() - daysAgo);

            await Workout.findByIdAndUpdate(workoutId, { workoutDate: date });

            const dateLabels = ['сегодня', 'вчера', 'позавчера', '3 дня назад'];
            await bot.answerCallbackQuery(query.id, { text: `✅ Дата изменена на ${dateLabels[daysAgo]}` });

            await bot.editMessageText(
                query.message.text.replace(/📅 Дата: .+/, `📅 Дата: ${dateLabels[daysAgo]}`),
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown'
                }
            );
        }

        // Кастомная дата
        else if (data.startsWith('date_custom_')) {
            const workoutId = data.replace('date_custom_', '');
            setAwaitingInput(chatId, { type: 'date', workoutId });


            await bot.answerCallbackQuery(query.id);
            await bot.sendMessage(chatId,
                '📅 Введи дату тренировки:\n\n' +
                'Примеры:\n' +
                '• 5 января\n' +
                '• 15.12.2024\n' +
                '• 4 дня назад'
            );
        }

        // Редактирование
        else if (data.startsWith('edit_')) {
            const workoutId = data.replace('edit_', '');
            setAwaitingInput(chatId, { type: 'edit', workoutId });


            await bot.answerCallbackQuery(query.id);
            await bot.sendMessage(chatId,
                '✏️ Отправь новое описание тренировки:\n\n' +
                'Например: "Жим лёжа 4 подхода по 55кг 10 раз"'
            );
        }

        // Удаление
        else if (data.startsWith('delete_')) {
            const workoutId = data.replace('delete_', '');

            const confirmKeyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Да, удалить', callback_data: `confirm_delete_${workoutId}` },
                        { text: '❌ Отмена', callback_data: 'cancel_delete' }
                    ]
                ]
            };

            await bot.answerCallbackQuery(query.id);
            await bot.sendMessage(chatId, '⚠️ Точно удалить эту тренировку?', {
                reply_markup: confirmKeyboard
            });
        }

        // Подтверждение удаления
        else if (data.startsWith('confirm_delete_')) {
            const workoutId = data.replace('confirm_delete_', '');

            await Workout.findByIdAndDelete(workoutId);

            // Обновляем статистику пользователя
            const user = await User.findOne({ telegramId: query.from.id });
            if (user) {
                user.stats.totalWorkouts = Math.max(0, user.stats.totalWorkouts - 1);
                await user.save();
            }

            await bot.answerCallbackQuery(query.id, { text: '🗑️ Тренировка удалена' });
            await bot.editMessageText('🗑️ Тренировка удалена', {
                chat_id: chatId,
                message_id: messageId
            });
        }

        // Отмена удаления
        else if (data === 'cancel_delete') {
            await bot.answerCallbackQuery(query.id, { text: '✅ Отменено' });
            await bot.deleteMessage(chatId, messageId);
        }

    } catch (error) {
        console.error('❌ Ошибка callback:', error);
        await bot.answerCallbackQuery(query.id, { text: '😕 Ошибка' });
    }
});

// /edit - Редактировать последнюю тренировку
bot.onText(/\/edit/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
        const lastWorkout = await Workout.findOne({ telegramId })
            .sort({ createdAt: -1 });

        if (!lastWorkout) {
            return await bot.sendMessage(chatId, '❌ Нет тренировок для редактирования');
        }

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✏️ Изменить данные', callback_data: `edit_${lastWorkout._id}` }
                ],
                [
                    { text: '📝 Добавить заметку', callback_data: `add_note_${lastWorkout._id}` },
                    { text: '😊 Самочувствие', callback_data: `add_feeling_${lastWorkout._id}` }
                ],
                [
                    { text: '📅 Изменить дату', callback_data: `change_date_${lastWorkout._id}` }
                ],
                [
                    { text: '🗑️ Удалить', callback_data: `delete_${lastWorkout._id}` }
                ]
            ]
        };

        const volume = (lastWorkout.sets || 0) * (lastWorkout.reps || 0) * (lastWorkout.weight || 0);
        const dateLabel = new Date(lastWorkout.workoutDate).toLocaleDateString('ru-RU');

        const message = `✏️ *Последняя тренировка:*\n\n` +
            `📅 Дата: ${dateLabel}\n` +
            `📋 Упражнение: ${lastWorkout.exercise}\n` +
            `🔢 Подходы: ${lastWorkout.sets || '-'}\n` +
            `⚖️ Вес: ${lastWorkout.weight ? lastWorkout.weight + ' кг' : '-'}\n` +
            `🔁 Повторения: ${lastWorkout.reps || '-'}\n` +
            `💪 Объём: ${volume > 0 ? volume.toLocaleString() + ' кг' : '-'}\n` +
            (lastWorkout.feeling ? `😊 Самочувствие: ${lastWorkout.feeling}\n` : '') +
            (lastWorkout.notes ? `📝 Заметка: ${lastWorkout.notes}\n` : '');

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });

    } catch (error) {
        console.error('❌ Ошибка /edit:', error);
        await bot.sendMessage(chatId, '😕 Ошибка при редактировании.');
    }
});

// ========== УТИЛИТЫ ==========

function getPeriodName(period) {
    const names = {
        'week': 'неделю',
        'month': 'месяц',
        '7days': '7 дней',
        '30days': '30 дней'
    };
    return names[period] || period;
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Останавливаю бота...');
    bot.stopPolling();
    await mongoose.connection.close();
    process.exit(0);
});
