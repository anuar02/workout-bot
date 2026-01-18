const statsService = require('../../services/stats');
const heatmapGenerator = require('../../utils/heatmapGenerator');
const { showStats } = require('../../utils/displays');
const { getPeriodName } = require('../../utils/formatters');

async function handleEnhancedStats(bot, msg, match) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const period = match && match[2] ? match[2] : 'month';

    try {
        await bot.sendChatAction(chatId, 'typing');

        // Get stats
        const stats = await statsService.getStats(telegramId, period);

        // Show text stats first
        await showStats(bot, chatId, stats);

        // Generate and send heatmap
        await bot.sendChatAction(chatId, 'upload_photo');

        try {
            const heatmapPath = await heatmapGenerator.generateHeatmap(telegramId, 90);

            await bot.sendPhoto(chatId, heatmapPath, {
                caption: '📅 *Твоя активность за последние 90 дней*\n\n' +
                    'Тренируйся регулярно, чтобы календарь был зелёным! 💪',
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📊 Детальная статистика', callback_data: 'stats_detailed' }
                        ],
                        [
                            { text: '📈 Прогресс по упражнениям', callback_data: 'progress_all' }
                        ],
                        [
                            { text: '📥 Экспорт данных', callback_data: 'export_data' }
                        ]
                    ]
                }
            });

            // Cleanup after sending
            setTimeout(() => {
                heatmapGenerator.cleanup(heatmapPath);
            }, 5000);

        } catch (error) {
            console.error('Error generating heatmap:', error);
            // Don't fail the whole command if heatmap fails
            await bot.sendMessage(chatId,
                '⚠️ Не удалось сгенерировать календарь активности.\n' +
                'Попробуй позже или обратись в поддержку.'
            );
        }

    } catch (error) {
        console.error('❌ Error in /stats:', error);
        await bot.sendMessage(chatId, '😕 Ошибка при получении статистики.');
    }
}

module.exports = handleEnhancedStats;
