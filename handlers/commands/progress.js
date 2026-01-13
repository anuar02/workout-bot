const statsService = require('../../services/stats');
const chartGenerator = require('../../utils/chartGenerator');

async function handleProgress(bot, msg, match) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const exercise = match && match[2];

    if (!exercise) {
        return await bot.sendMessage(chatId, '📈 Укажи упражнение:\n/progress жим лёжа');
    }

    try {
        await bot.sendChatAction(chatId, 'typing');
        const progress = await statsService.getProgress(telegramId, exercise, 30);

        if (progress.workouts === 0) {
            return await bot.sendMessage(chatId, `📈 Нет данных по упражнению "${exercise}"`);
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
}

module.exports = handleProgress;
