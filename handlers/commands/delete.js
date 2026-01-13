const User = require('../../models/User');
const Workout = require('../../models/Workout');

async function handleDelete(bot, msg) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
        const lastWorkout = await Workout.findOne({ telegramId }).sort({ createdAt: -1 });

        if (!lastWorkout) {
            return await bot.sendMessage(chatId, '❌ Нет тренировок для удаления');
        }

        await Workout.deleteOne({ _id: lastWorkout._id });

        const user = await User.findOne({ telegramId });
        if (user) {
            user.stats.totalWorkouts = Math.max(0, user.stats.totalWorkouts - 1);
            await user.save();
        }

        await bot.sendMessage(chatId,
            `🗑️ Удалена последняя тренировка:\n` +
            `${lastWorkout.exercise} - ${lastWorkout.sets}х${lastWorkout.reps}х${lastWorkout.weight}кг`
        );

    } catch (error) {
        console.error('❌ Ошибка /delete:', error);
        await bot.sendMessage(chatId, '😕 Ошибка при удалении.');
    }
}

module.exports = handleDelete;
