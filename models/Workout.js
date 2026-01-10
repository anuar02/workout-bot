const mongoose = require('mongoose');

const workoutSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    telegramId: {
        type: Number,
        required: true,
        index: true
    },

    // Данные тренировки
    exercise: {
        type: String,
        required: true,
        index: true
    },
    sets: Number,
    weight: Number,
    reps: Number,

    // Новые поля
    workoutDate: {
        type: Date,
        default: Date.now,
        index: true
    }, // ← Дата когда была тренировка (может отличаться от createdAt)

    notes: String, // ← Заметки пользователя

    feeling: { // ← Самочувствие
        type: String,
        enum: ['отлично', 'хорошо', 'нормально', 'тяжело', 'плохо', null],
        default: null
    },

    duration: Number, // в минутах

    // Метаданные
    transcription: String,
    voiceDuration: Number,

    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now }
});

// Обновляем updatedAt при изменении
workoutSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Workout', workoutSchema);
