const User = require('../../models/User');
const Workout = require('../../models/Workout');
const { setAwaitingInput } = require('../../utils/state');

async function handleWorkout(bot, query) {
    const data = query.data;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const telegramId = query.from.id;

    // Add note
    if (data.startsWith('add_note_')) {
        const workoutId = data.replace('add_note_', '');
        setAwaitingInput(chatId, { type: 'note', workoutId });

        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId, '📝 Напиши заметку к тренировке:');
        return;
    }

    // Add feeling
    if (data.startsWith('add_feeling_')) {
        const workoutId = data.replace('add_feeling_', '');

        const feelingKeyboard = {
            inline_keyboard: [
                [
                    { text: '😄 Отлично', callback_data: `feeling_${workoutId}_отлично` },
                    { text: '🙂 Хорошо', callback_data: `feeling_${workoutId}_хорошо` }
                ],
                [
                    { text: '😐 Нормально', callback_data: `feeling_${workoutId}_нормально` },
                    { text: '😓 Тяжело', callback_data: `feeling_${workoutId}_тяжело` }
                ],
                [
                    { text: '😢 Плохо', callback_data: `feeling_${workoutId}_плохо` }
                ]
            ]
        };

        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId, '😊 Как себя чувствовал на тренировке?', {
            reply_markup: feelingKeyboard
        });
        return;
    }

    // Save feeling
    if (data.startsWith('feeling_')) {
        const parts = data.split('_');
        const workoutId = parts[1];
        const feeling = parts[2];

        await Workout.findByIdAndUpdate(workoutId, { feeling });

        await bot.answerCallbackQuery(query.id, { text: '✅ Самочувствие сохранено!' });
        await bot.editMessageText(
            query.message.text + `\n😊 Самочувствие: ${feeling}`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            }
        );
        return;
    }

    // Change date
    if (data.startsWith('change_date_')) {
        const workoutId = data.replace('change_date_', '');

        const dateKeyboard = {
            inline_keyboard: [
                [
                    { text: '📅 Сегодня', callback_data: `date_${workoutId}_0` },
                    { text: '📅 Вчера', callback_data: `date_${workoutId}_1` }
                ],
                [
                    { text: '📅 Позавчера', callback_data: `date_${workoutId}_2` },
                    { text: '📅 3 дня назад', callback_data: `date_${workoutId}_3` }
                ],
                [
                    { text: '✏️ Другая дата', callback_data: `date_custom_${workoutId}` }
                ]
            ]
        };

        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId, '📅 Когда была тренировка?', {
            reply_markup: dateKeyboard
        });
        return;
    }

    // Set date
    if (data.startsWith('date_') && !data.startsWith('date_custom_')) {
        const parts = data.split('_');
        const workoutId = parts[1];
        const daysAgo = parseInt(parts[2]);

        const date = new Date();
        date.setDate(date.getDate() - daysAgo);

        await Workout.findByIdAndUpdate(workoutId, { workoutDate: date });

        const dateLabels = ['сегодня', 'вчера', 'позавчера', '3 дня назад'];
        await bot.answerCallbackQuery(query.id, { text: `✅ Дата изменена на ${dateLabels[daysAgo]}` });

        await bot.editMessageText(
            query.message.text.replace(/📅 Дата: .+/, `📅 Дата: ${dateLabels[daysAgo]}`),
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            }
        );
        return;
    }

    // Custom date
    if (data.startsWith('date_custom_')) {
        const workoutId = data.replace('date_custom_', '');
        setAwaitingInput(chatId, { type: 'date', workoutId });

        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId,
            '📅 Введи дату тренировки:\n\n' +
            'Примеры:\n' +
            '• 5 января\n' +
            '• 15.12.2024\n' +
            '• 4 дня назад'
        );
        return;
    }

    // Edit workout
    if (data.startsWith('edit_')) {
        const workoutId = data.replace('edit_', '');
        setAwaitingInput(chatId, { type: 'edit', workoutId });

        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId,
            '✏️ Отправь новое описание тренировки:\n\n' +
            'Например: "Жим лёжа 4 подхода по 55кг 10 раз"'
        );
        return;
    }

    // Delete workout
    if (data.startsWith('delete_')) {
        const workoutId = data.replace('delete_', '');

        const confirmKeyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Да, удалить', callback_data: `confirm_delete_${workoutId}` },
                    { text: '❌ Отмена', callback_data: 'cancel_delete' }
                ]
            ]
        };

        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId, '⚠️ Точно удалить эту тренировку?', {
            reply_markup: confirmKeyboard
        });
        return;
    }

    // Confirm delete
    if (data.startsWith('confirm_delete_')) {
        const workoutId = data.replace('confirm_delete_', '');

        await Workout.findByIdAndDelete(workoutId);

        const user = await User.findOne({ telegramId });
        if (user) {
            user.stats.totalWorkouts = Math.max(0, user.stats.totalWorkouts - 1);
            await user.save();
        }

        await bot.answerCallbackQuery(query.id, { text: '🗑️ Тренировка удалена' });
        await bot.editMessageText('🗑️ Тренировка удалена', {
            chat_id: chatId,
            message_id: messageId
        });
        return;
    }

    // Cancel delete
    if (data === 'cancel_delete') {
        await bot.answerCallbackQuery(query.id, { text: '✅ Отменено' });
        await bot.deleteMessage(chatId, messageId);
    }
}

module.exports = { handleWorkout };
