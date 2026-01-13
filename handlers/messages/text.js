const User = require('../../models/User');
const Workout = require('../../models/Workout');
const parserService = require('../../services/parser');
const subscriptionService = require('../../services/subscription');
const gamificationService = require('../../services/gamification');
const profileHandler = require('../commands/profile');
const { awaitingInput, userContext, setAwaitingInput, clearAwaitingInput } = require('../../utils/state');
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const apiLogger = require('../../services/apiLogger');

async function handleMessage(bot, msg) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const text = msg.text;

    if (!text) return;

    try {
        const user = await User.findOne({ telegramId });
        if (!user) {
            return await bot.sendMessage(chatId, '⚠️ Нажми /start');
        }

        // Handle menu buttons
        if (await handleMenuButtons(bot, chatId, user, text)) {
            return;
        }

        // Handle profile input
        const profileHandled = await profileHandler.handleProfileInput(bot, msg);
        if (profileHandled) return;

        // Handle awaiting input (notes, dates, edits)
        if (await handleAwaitingInput(bot, chatId, msg)) {
            return;
        }

        // Detect workout vs chat
        const isWorkoutDescription = await detectWorkoutIntent(text);

        if (isWorkoutDescription) {
            await processWorkoutText(bot, msg, user, text);
        } else {
            await handleChatMessage(bot, msg, text);
        }

    } catch (error) {
        console.error('❌ Ошибка обработки текста:', error);
        await bot.sendMessage(chatId, '😕 Что-то пошло не так. Попробуй ещё раз.');
    }
}

async function handleMenuButtons(bot, chatId, user, text) {
    const statsService = require('../../services/stats');
    const { showStats, showAchievements, showProgressMenu, showPremiumInfo, showSettings } = require('../../utils/displays');

    switch (text) {
        case '🎮 Мой персонаж':
            await require('../../utils/displays').showCharacterInfo(bot, chatId, user);
            return true;
        case '📊 Статистика':
            const stats = await statsService.getStats(user.telegramId, 'month');
            await showStats(bot, chatId, stats);
            return true;
        case '🏆 Достижения':
            await showAchievements(bot, chatId, user);
            return true;
        case '📈 Прогресс':
            await showProgressMenu(bot, chatId, user);
            return true;
        case '💎 Premium':
            await showPremiumInfo(bot, chatId, user);
            return true;
        case '⚙️ Настройки':
            await showSettings(bot, chatId, user);
            return true;
        default:
            return false;
    }
}

async function handleAwaitingInput(bot, chatId, msg) {
    if (!awaitingInput[chatId]) return false;

    const input = awaitingInput[chatId];
    const chrono = require('chrono-node');

    try {
        if (input.type === 'note') {
            await Workout.findByIdAndUpdate(input.workoutId, { notes: msg.text });
            await bot.sendMessage(chatId, `✅ Заметка сохранена: "${msg.text}"`);
            clearAwaitingInput(chatId);
            return true;
        }

        if (input.type === 'date') {
            const parsed = chrono.ru.parseDate(msg.text) || new Date();
            await Workout.findByIdAndUpdate(input.workoutId, { workoutDate: parsed });
            await bot.sendMessage(chatId, `✅ Дата изменена на ${parsed.toLocaleDateString('ru-RU')}`);
            clearAwaitingInput(chatId);
            return true;
        }

        if (input.type === 'edit') {
            const workouts = await parserService.parseWorkout(msg.text);

            if (workouts.length === 0 || !workouts[0].exercise) {
                await bot.sendMessage(chatId, '❌ Не смог определить упражнение. Попробуй ещё раз.');
                return true;
            }

            // Берем первый workout для редактирования
            const parsed = workouts[0];

            await Workout.findByIdAndUpdate(input.workoutId, {
                exercise: parsed.exercise,
                sets: parsed.sets,
                weight: parsed.weight,
                reps: parsed.reps
            });

            const volume = (parsed.sets || 1) * (parsed.reps || 0) * (parsed.weight || 0);
            await bot.sendMessage(chatId,
                `✅ Тренировка обновлена!\n\n` +
                `📋 ${parsed.exercise}\n` +
                `🔢 ${parsed.sets || '-'} подходов\n` +
                `⚖️ ${parsed.weight || '-'} кг\n` +
                `🔁 ${parsed.reps || '-'} повторений\n` +
                `💪 Объём: ${volume > 0 ? volume.toLocaleString() + ' кг' : '-'}`
            );
            clearAwaitingInput(chatId);
            return true;
        }

    } catch (error) {
        console.error('❌ Ошибка обработки ввода:', error);
        await bot.sendMessage(chatId, '😕 Ошибка. Попробуй ещё раз.');
        clearAwaitingInput(chatId);
        return true;
    }

    return false;
}

async function detectWorkoutIntent(text) {
    const workoutKeywords = [
        'жим', 'присед', 'тяга', 'подтягивание', 'отжимание',
        'подход', 'сет', 'повторени', 'раз', 'кг', 'килограмм',
        'сделал', 'выполнил', 'тренировка', 'упражнение'
    ];

    const lowerText = text.toLowerCase();
    const hasWorkoutKeywords = workoutKeywords.some(keyword => lowerText.includes(keyword));
    const hasWorkoutPattern = /\d+\s*[xх]\s*\d+/.test(lowerText);

    if (hasWorkoutKeywords || hasWorkoutPattern) return true;

    const questionWords = ['что', 'как', 'почему', 'когда', 'зачем', 'где', 'кто', 'напиши', 'расскажи', 'объясни'];
    const hasQuestionWords = questionWords.some(word => lowerText.startsWith(word));

    if (hasQuestionWords) return false;

    if (text.length < 100) {
        return await detectIntentWithAI(text);
    }

    return false;
}

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
        const tokensUsed = response.usage.total_tokens;
        const cost = (response.usage.prompt_tokens * 0.150 + response.usage.completion_tokens * 0.600) / 1000000;
        apiLogger.log('gpt-intent', cost, { tokens: tokensUsed, intent });

        return intent === 'workout';

    } catch (error) {
        console.error('❌ Ошибка определения намерения:', error);
        return true;
    }
}

async function processWorkoutText(bot, msg, user, text) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
        await bot.sendChatAction(chatId, 'typing');
        console.log(`📝 Текст тренировки от ${msg.from.username || msg.from.first_name}: ${text}`);

        // Парсим - теперь возвращает массив
        const context = userContext[telegramId];
        const workouts = await parserService.parseWorkout(text, context);

        if (workouts.length === 0) {
            return await bot.sendMessage(chatId,
                '🤔 Не смог определить упражнение.\n\n' +
                'Попробуй так: "Жим лёжа 3 подхода по 50кг 12 раз"\n' +
                'Или отправь голосовое сообщение 🎤'
            );
        }

        // Сохраняем все подходы
        const savedWorkouts = [];
        for (const workoutData of workouts) {
            const workout = new Workout({
                userId: user._id,
                telegramId,
                exercise: workoutData.exercise,
                sets: workoutData.sets,
                weight: workoutData.weight,
                reps: workoutData.reps,
                workoutDate: workoutData.workoutDate || new Date(),
                notes: workoutData.notes,
                feeling: workoutData.feeling,
                transcription: text
            });

            await workout.save();
            savedWorkouts.push(workout);
        }

        console.log(`💾 Сохранено ${savedWorkouts.length} подход(ов)`);

        // Обновляем статистику
        user.stats.totalWorkouts += savedWorkouts.length;
        user.stats.monthlyWorkouts += savedWorkouts.length;
        user.stats.lastWorkoutDate = new Date();
        user.lastActive = new Date();

        // Обновляем стрейк
        await gamificationService.updateStreak(telegramId);

        // Начисляем XP (за все подходы)
        let totalXP = 0;
        for (const workout of savedWorkouts) {
            const xpResult = await gamificationService.awardWorkoutXP(telegramId, workout);
            if (xpResult) {
                totalXP += xpResult.xpGained;
            }
        }

        await user.save();

        // Сохраняем последний workout в контекст
        userContext[telegramId] = workouts[workouts.length - 1];

        // Формируем ответ
        const message = formatMultiWorkoutConfirmation(workouts, savedWorkouts, user, totalXP);

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown'
        });

    } catch (error) {
        console.error('❌ Ошибка обработки текста:', error);
        await bot.sendMessage(chatId,
            '😕 Не смог обработать. Попробуй переформулировать или используй голосовое сообщение.'
        );
    }
}

function formatMultiWorkoutConfirmation(workouts, savedWorkouts, user, totalXP) {
    const updatedUser = user;
    const characterInfo = gamificationService.getCharacterInfo(updatedUser);

    // Группируем по упражнениям
    const grouped = {};
    workouts.forEach((w, i) => {
        if (!grouped[w.exercise]) {
            grouped[w.exercise] = [];
        }
        grouped[w.exercise].push({ ...w, _id: savedWorkouts[i]._id });
    });

    let message = '✅ *Записано!*\n\n';
    message += `📅 Дата: ${workouts[0].dateLabel || new Date().toLocaleDateString('ru-RU')}\n\n`;

    // Выводим по упражнениям
    for (const [exercise, sets] of Object.entries(grouped)) {
        message += `📋 *${exercise.charAt(0).toUpperCase() + exercise.slice(1)}*\n`;

        sets.forEach((set, idx) => {
            const weight = set.weight ? `${set.weight} кг` : '-';
            const reps = set.reps || '-';
            const volume = (set.weight || 0) * (set.reps || 0);

            message += `   ${idx + 1}. ${weight} × ${reps} повторений`;
            if (volume > 0) {
                message += ` (${volume.toLocaleString()} кг)`;
            }
            message += '\n';
        });

        // Итого по упражнению
        const totalVolume = sets.reduce((sum, s) => sum + ((s.weight || 0) * (s.reps || 0)), 0);
        if (totalVolume > 0) {
            message += `   💪 Объём: *${totalVolume.toLocaleString()} кг*\n`;
        }
        message += '\n';
    }

    // Общая статистика
    const totalVolume = workouts.reduce((sum, w) => sum + ((w.weight || 0) * (w.reps || 0)), 0);

    message += `📊 *Итого:*\n`;
    message += `   • Подходов: ${workouts.length}\n`;
    message += `   • Упражнений: ${Object.keys(grouped).length}\n`;
    if (totalVolume > 0) {
        message += `   • Общий объём: ${totalVolume.toLocaleString()} кг\n`;
    }

    // Gamification
    if (characterInfo && totalXP > 0) {
        message += `\n🎮 *${characterInfo.name}*\n`;
        message += `   +${totalXP} XP\n`;
        message += `   Уровень: ${updatedUser.gamification.level}\n`;

        const progressBar = generateProgressBar(
            updatedUser.gamification.xp,
            updatedUser.gamification.xpToNextLevel
        );
        message += `   ${progressBar}\n`;
    }

    // Стрейк
    if (updatedUser.gamification.streak > 1) {
        message += `\n🔥 Стрейк: ${updatedUser.gamification.streak} дней\n`;
    }

    message += `\n_Всего тренировок: ${updatedUser.stats.totalWorkouts}_`;

    return message;
}

function generateProgressBar(current, total, length = 10) {
    const percentage = Math.min(current / total, 1);
    const filled = Math.round(percentage * length);
    const empty = length - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty) + ` ${Math.round(percentage * 100)}%`;
}

async function handleChatMessage(bot, msg, text) {
    const chatId = msg.chat.id;
    const lowerText = text.toLowerCase();

    if (lowerText.includes('как') && (lowerText.includes('работа') || lowerText.includes('пользоваться'))) {
        return await bot.sendMessage(chatId,
            `🤖 Я помогаю записывать твои тренировки!\n\n` +
            `Просто отправь голосовое или напиши:\n` +
            `"Жим лёжа 3 подхода по 50кг 12 раз"\n\n` +
            `Команды: /help`
        );
    }

    if (lowerText.includes('привет') || lowerText.includes('здравству')) {
        return await bot.sendMessage(chatId,
            `👋 Привет! Готов записать тренировку?\n\n` +
            `Отправь голосовое или напиши текстом!\n` +
            `Команды: /help`
        );
    }

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

module.exports = handleMessage;
module.exports.detectWorkoutIntent = detectWorkoutIntent;
module.exports.handleChatMessage = handleChatMessage;
module.exports.processWorkoutText = processWorkoutText;
