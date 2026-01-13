const User = require('../../models/User');
const exportService = require('../../services/export');

async function handleExport(bot, msg, match) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const format = match && match[2] ? match[2] : 'excel';

    try {
        const user = await User.findOne({ telegramId });
        if (!user) {
            return await bot.sendMessage(chatId, '⚠️ Сначала нажми /start');
        }

        await bot.sendChatAction(chatId, 'upload_document');
        await bot.sendMessage(chatId, '📦 Готовлю экспорт...');

        let filepath, caption;

        if (format === 'csv') {
            filepath = await exportService.exportToCSV(telegramId, user.username || user.firstName);
            caption = '📄 Твои тренировки в CSV формате';
        } else {
            filepath = await exportService.exportToExcel(telegramId, user.username || user.firstName);
            caption = '📊 Твои тренировки в Excel формате';
        }

        await bot.sendDocument(chatId, filepath, { caption });
        setTimeout(() => exportService.cleanupFile(filepath), 5000);

    } catch (error) {
        console.error('❌ Ошибка /export:', error);
        if (error.message === 'Нет данных для экспорта') {
            await bot.sendMessage(chatId, '📭 У тебя пока нет записанных тренировок!');
        } else {
            await bot.sendMessage(chatId, '😕 Ошибка при создании экспорта.');
        }
    }
}

module.exports = handleExport;
