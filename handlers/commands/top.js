const statsService = require('../../services/stats');

async function handleTop(bot, msg) {
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
}

module.exports = handleTop;
