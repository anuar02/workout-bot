const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: {
        type: Number,
        required: true,
        unique: true,
        index: true
    },
    username: String,
    firstName: String,
    lastName: String,

    // Настройки
    settings: {
        language: { type: String, default: 'ru' },
        notifications: { type: Boolean, default: true },
        isPro: { type: Boolean, default: false },
        timezone: { type: String, default: 'UTC' },

        // Напоминания
        reminders: {
            enabled: { type: Boolean, default: false },
            time: { type: String, default: '18:00' }, // HH:MM
            days: [{ type: Number }] // [1,3,5] = Пн, Ср, Пт
        }
    },

    // Шаблоны тренировок
    templates: [{
        name: String,
        exercises: [{
            exercise: String,
            sets: Number,
            weight: Number,
            reps: Number
        }],
        createdAt: { type: Date, default: Date.now }
    }],

    // Статистика
    stats: {
        totalWorkouts: { type: Number, default: 0 },
        monthlyWorkouts: { type: Number, default: 0 },
        lastWorkoutDate: Date,
        currentStreak: { type: Number, default: 0 }, // ← Дни подряд
        longestStreak: { type: Number, default: 0 }
    },

    createdAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
