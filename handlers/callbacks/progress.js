const statsService = require('../../services/stats');
const chartGenerator = require('../../utils/chartGenerator');

async function handleProgress(bot, query) {
    const data = query.data;
    const chatId = query.message.chat.id;
    const telegramId = query.from.id;

    const exercise = data.replace('progress_', '');
    await bot.answerCallbackQuery(query.id);

    if (exercise === 'all') {
        const top = await statsService.getTopExercises(telegramId);
        
        if (top.length === 0) {
            await bot.sendMessage(chatId, '📈 Нет данных для отображения');
            return;
        }

        let message = '📈 *Выбери упражнение:*\n\n';
        const keyboard = {
            inline_keyboard: top.map(item => ([
                { text: `${item._id} (${item.count} тренировок)`, callback_data: `progress_${item._id}` }
            ]))
        };

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
        return;
    }

    const progress = await statsService.getProgress(telegramId, exercise, 30);

    if (progress.workouts === 0) {
        await bot.sendMessage(chatId, `📈 Нет данных по "${exercise}"`);
        return;
    }

    const chart = await chartGenerator.generateProgressChart(progress);
    await bot.sendPhoto(chatId, chart, {
        caption: `📈 Прогресс: ${exercise}\n${progress.workouts} тренировок за 30 дней`
    });
}

module.exports = { handleProgress };
