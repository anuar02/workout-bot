const apiLogger = require('../../services/apiLogger');

async function handleCosts(bot, msg) {
    const chatId = msg.chat.id;

    try {
        const stats = apiLogger.getStats();
        const today = apiLogger.getTodayStats();

        if (stats.logs.length === 0) {
            return await bot.sendMessage(chatId, '💰 Пока нет данных о расходах API');
        }

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

        message += `\n*Средняя стоимость записи тренировки:* $${(stats.totalCost / (byType['whisper']?.count || 1)).toFixed(6)}`;

        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('❌ Ошибка /costs:', error);
        await bot.sendMessage(chatId, '😕 Ошибка при получении статистики расходов.');
    }
}

module.exports = handleCosts;
