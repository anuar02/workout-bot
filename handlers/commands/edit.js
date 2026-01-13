const Workout = require('../../models/Workout');

async function handleEdit(bot, msg) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
        const lastWorkout = await Workout.findOne({ telegramId }).sort({ createdAt: -1 });

        if (!lastWorkout) {
            return await bot.sendMessage(chatId, '❌ Нет тренировок для редактирования');
        }

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✏️ Изменить данные', callback_data: `edit_${lastWorkout._id}` }
                ],
                [
                    { text: '📝 Добавить заметку', callback_data: `add_note_${lastWorkout._id}` },
                    { text: '😊 Самочувствие', callback_data: `add_feeling_${lastWorkout._id}` }
                ],
                [
                    { text: '📅 Изменить дату', callback_data: `change_date_${lastWorkout._id}` }
                ],
                [
                    { text: '🗑️ Удалить', callback_data: `delete_${lastWorkout._id}` }
                ]
            ]
        };

        const volume = (lastWorkout.sets || 0) * (lastWorkout.reps || 0) * (lastWorkout.weight || 0);
        const dateLabel = new Date(lastWorkout.workoutDate).toLocaleDateString('ru-RU');

        const message = `✏️ *Последняя тренировка:*\n\n` +
            `📅 Дата: ${dateLabel}\n` +
            `📋 Упражнение: ${lastWorkout.exercise}\n` +
            `🔢 Подходы: ${lastWorkout.sets || '-'}\n` +
            `⚖️ Вес: ${lastWorkout.weight ? lastWorkout.weight + ' кг' : '-'}\n` +
            `🔁 Повторения: ${lastWorkout.reps || '-'}\n` +
            `💪 Объём: ${volume > 0 ? volume.toLocaleString() + ' кг' : '-'}\n` +
            (lastWorkout.feeling ? `😊 Самочувствие: ${lastWorkout.feeling}\n` : '') +
            (lastWorkout.notes ? `📝 Заметка: ${lastWorkout.notes}\n` : '');

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });

    } catch (error) {
        console.error('❌ Ошибка /edit:', error);
        await bot.sendMessage(chatId, '😕 Ошибка при редактировании.');
    }
}

module.exports = handleEdit;
