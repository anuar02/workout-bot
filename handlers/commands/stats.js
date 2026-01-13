const statsService = require('../../services/stats');
const { showStats } = require('../../utils/displays');
const { getPeriodName } = require('../../utils/formatters');

async function handleStats(bot, msg, match) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const period = match && match[2] ? match[2] : 'week';

    try {
        await bot.sendChatAction(chatId, 'typing');
        const stats = await statsService.getStats(telegramId, period);
        await showStats(bot, chatId, stats);
    } catch (error) {
        console.error('❌ Ошибка /stats:', error);
        await bot.sendMessage(chatId, '😕 Ошибка при получении статистики.');
    }
}

module.exports = handleStats;
