const statsService = require('../../services/stats');
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

    } catch (error) {
        console.error('❌ Error in /stats:', error);
        await bot.sendMessage(chatId, '😕 Ошибка при получении статистики.');
    }
}

module.exports = handleEnhancedStats;
