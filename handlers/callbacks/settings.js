const User = require('../../models/User');
const Workout = require('../../models/Workout');

async function handleSettings(bot, query) {
    const data = query.data;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const telegramId = query.from.id;

    // Delete account flow
    if (data === 'delete_account') {
        console.log('deleted')
        await bot.answerCallbackQuery(query.id);

        const user = await User.findOne({ telegramId });

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '⚠️ Да, удалить всё', callback_data: 'confirm_delete_account' }
                ],
                [
                    { text: '❌ Отмена', callback_data: 'cancel_delete_account' }
                ]
            ]
        };

        await bot.sendMessage(chatId,
            `⚠️ *УДАЛЕНИЕ АККАУНТА*\n\n` +
            `Это действие нельзя отменить!\n\n` +
            `Будет удалено:\n` +
            `❌ Все тренировки\n` +
            `❌ Весь прогресс\n` +
            `❌ ${user.gamification.character.name} (уровень ${user.gamification.character.level})\n` +
            `❌ Все достижения\n` +
            `❌ Подписка (без возврата средств)\n\n` +
            `Ты уверен?`,
            {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            }
        );
        return;
    }

    if (data === 'confirm_delete_account') {
        await bot.answerCallbackQuery(query.id, { text: 'Удаляем...' });

        try {
            const user = await User.findOne({ telegramId });

            // Delete all workouts
            await Workout.deleteMany({ telegramId });

            // Delete user
            await User.deleteOne({ telegramId });

            await bot.sendMessage(chatId,
                `✅ Аккаунт удалён.\n\n` +
                `Все данные стёрты безвозвратно.\n\n` +
                `Если захочешь вернуться - нажми /start\n\n` +
                `Удачи! 👋`
            );

            console.log(`🗑️ Account deleted: ${user.username} (${telegramId})`);

        } catch (error) {
            console.error('❌ Delete account error:', error);
            await bot.sendMessage(chatId, '😕 Ошибка при удалении. Обратись в поддержку.');
        }
        return;
    }

    if (data === 'cancel_delete_account') {
        await bot.answerCallbackQuery(query.id, { text: '✅ Отменено' });
        await bot.editMessageText(
            '👌 Удаление отменено. Твои данные в безопасности!',
            {
                chat_id: chatId,
                message_id: messageId
            }
        );
        return;
    }

    // Other settings (reminders, language) - placeholder
    if (data === 'settings_reminders') {
        await bot.answerCallbackQuery(query.id, { text: 'Скоро будет!' });
        return;
    }

    if (data === 'settings_language') {
        await bot.answerCallbackQuery(query.id, { text: 'Скоро будет!' });
    }
}

module.exports = { handleSettings };
