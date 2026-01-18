const User = require('../../models/User');
const statsService = require('../../services/stats');
const exportService = require('../../services/export');
const heatmapGenerator = require('../../utils/heatMapGenerator');
const { showStats, showAchievements } = require('../../utils/displays');

async function handleStats(bot, query) {
    const data = query.data;
    const chatId = query.message.chat.id;
    const telegramId = query.from.id;

    if (data === 'show_stats') {
        await bot.answerCallbackQuery(query.id);
        const stats = await statsService.getStats(telegramId, 'month');
        await showStats(bot, chatId, stats);

        const heatmapPath = await heatmapGenerator.generateHeatmap(telegramId, 90);
        await bot.sendPhoto(chatId, heatmapPath, {
            caption: '📅 Твоя активность за 90 дней'
        });

        setTimeout(() => heatmapGenerator.cleanup(heatmapPath), 5000);
        return;
    }

    if (data === 'show_achievements') {
        await bot.answerCallbackQuery(query.id);
        const user = await User.findOne({ telegramId });
        await showAchievements(bot, chatId, user);
        return;
    }

    if (data === 'export_data') {
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId,
            '📥 Выбери формат экспорта:',
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📊 Excel', callback_data: 'export_excel' },
                            { text: '📄 CSV', callback_data: 'export_csv' }
                        ]
                    ]
                }
            }
        );
        return;
    }

    if (data === 'export_excel') {
        await bot.answerCallbackQuery(query.id);
        const user = await User.findOne({ telegramId });
        const filepath = await exportService.exportToExcel(telegramId, user.username);
        await bot.sendDocument(chatId, filepath, {
            caption: '📊 Твои тренировки в Excel'
        });
        setTimeout(() => exportService.cleanupFile(filepath), 5000);
        return;
    }

    if (data === 'export_csv') {
        await bot.answerCallbackQuery(query.id);
        const user = await User.findOne({ telegramId });
        const filepath = await exportService.exportToCSV(telegramId, user.username);
        await bot.sendDocument(chatId, filepath, {
            caption: '📄 Твои тренировки в CSV'
        });
        setTimeout(() => exportService.cleanupFile(filepath), 5000);
    }
}

module.exports = { handleStats };
