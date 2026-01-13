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

    profile: {
        weight: Number,           // kg
        height: Number,           // cm
        age: Number,
        gender: {
            type: String,
            enum: ['male', 'female', 'other', null],
            default: null
        },
        goal: {
            type: String,
            enum: ['strength', 'hypertrophy', 'endurance', 'weight_loss', 'general', null],
            default: null
        },
        experience: {
            type: String,
            enum: ['beginner', 'intermediate', 'advanced', null],
            default: null
        },
        completedAt: Date
    },

    // Настройки
    settings: {
        language: { type: String, default: 'ru' },
        notifications: { type: Boolean, default: true },
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
        currentStreak: { type: Number, default: 0 },
        longestStreak: { type: Number, default: 0 }
    },

    // ========== МОНЕТИЗАЦИЯ ==========
    subscription: {
        tier: {
            type: String,
            enum: ['free', 'basic', 'premium', 'pro'],
            default: 'free'
        },
        isActive: { type: Boolean, default: false },
        startedAt: Date,
        expiresAt: Date,
        autoRenew: { type: Boolean, default: true },

        // Trial
        trial: {
            used: { type: Boolean, default: false },
            startedAt: Date,
            expiresAt: Date,
            tier: { type: String, default: 'premium' },
            offerShownAt: Date // Когда показали оффер trial
        },

        // История платежей
        payments: [{
            amount: Number,
            currency: String,
            tier: String,
            status: String, // 'pending', 'completed', 'failed', 'refunded'
            telegramPaymentId: String,
            provider: String, // 'telegram_stars', 'stripe'
            createdAt: { type: Date, default: Date.now }
        }],

        // Лимиты
        limits: {
            workoutsThisMonth: { type: Number, default: 0 },
            workoutsLimit: { type: Number, default: Infinity },  // ← CHANGE from 15
            voiceLogsThisMonth: { type: Number, default: 0 },    // ← ADD
            voiceLogsLimit: { type: Number, default: 3 },        // ← ADD
            lastResetDate: Date
        },

        // Специальные офферы
        specialOffers: [{
            offerId: String,
            price: Number,
            discount: Number, // Процент скидки
            expiresAt: Date,
            accepted: { type: Boolean, default: false },
            shownAt: Date
        }]
    },

    // ========== ГЕЙМИФИКАЦИЯ ==========
    gamification: {
        // Персонаж
        character: {
            type: {
                type: String,
                enum: ['cat', 'dog', 'lion', 'gorilla', null],
                default: null
            },
            name: String, // Барсик, Рекс и т.д.
            level: { type: Number, default: 1 },
            xp: { type: Number, default: 0 },
            nextLevelXP: { type: Number, default: 100 },
            evolutionStage: { type: Number, default: 0 }, // 0-3
            imageUrl: String, // URL картинки персонажа
            customGenerated: { type: Boolean, default: false } // DALL-E или статичный
        },

        // Достижения
        achievements: [{
            id: String,
            name: String,
            unlockedAt: { type: Date, default: Date.now }
        }],

        // Бейджи
        badges: [{
            id: String,
            name: String,
            description: String,
            earnedAt: { type: Date, default: Date.now }
        }],

        // Рейтинг
        leaderboard: {
            rank: Number,
            weeklyVolume: { type: Number, default: 0 },
            monthlyVolume: { type: Number, default: 0 }
        }
    },

    // ========== МАРКЕТИНГ ==========
    marketing: {
        // Реферальная программа
        referralCode: String,
        referredBy: String,
        referrals: [{
            userId: mongoose.Schema.Types.ObjectId,
            telegramId: Number,
            convertedToPaid: { type: Boolean, default: false },
            paidAt: Date,
            rewardClaimed: { type: Boolean, default: false },
            freeMonthsGranted: { type: Number, default: 0 }
        }],

        // Источник трафика
        source: {
            utm_source: String,
            utm_medium: String,
            utm_campaign: String,
            referrer: String
        },

        // Отказы от покупки (для анализа)
        declines: [{
            stage: String, // 'trial_offer', 'trial_end', 'paywall'
            reason: String,
            date: { type: Date, default: Date.now }
        }]
    },

    // Онбординг
    onboarding: {
        completed: { type: Boolean, default: false },
        currentStep: { type: Number, default: 0 },
        characterSelected: { type: Boolean, default: false },
        firstWorkoutRecorded: { type: Boolean, default: false }
    },

    createdAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
});

// ========== МЕТОДЫ ==========

// Проверка лимитов для free tier
userSchema.methods.canRecordWorkout = function() {
    if (this.subscription.isActive && this.subscription.tier !== 'free') {
        return true; // Платные - безлимит
    }

    // Сброс счётчика в начале месяца
    const now = new Date();
    const lastReset = this.subscription.limits.lastResetDate;

    if (!lastReset || lastReset.getMonth() !== now.getMonth()) {
        this.subscription.limits.workoutsThisMonth = 0;
        this.subscription.limits.lastResetDate = now;
    }

    return this.subscription.limits.workoutsThisMonth < this.subscription.limits.workoutsLimit;
};

// Добавление XP
userSchema.methods.addXP = function(amount) {
    const multiplier = this.subscription.tier === 'premium' ? 1.5 : 1.0;
    const xpToAdd = Math.floor(amount * multiplier);

    this.gamification.character.xp += xpToAdd;

    // Проверка level up
    while (this.gamification.character.xp >= this.gamification.character.nextLevelXP) {
        this.gamification.character.xp -= this.gamification.character.nextLevelXP;
        this.gamification.character.level += 1;

        // Увеличиваем требование для следующего уровня
        this.gamification.character.nextLevelXP = Math.floor(
            this.gamification.character.nextLevelXP * 1.2
        );

        // Проверка эволюции (каждые 5 уровней для free, 3 для premium)
        const evolutionInterval = this.subscription.tier === 'premium' ? 3 : 5;
        if (this.gamification.character.level % evolutionInterval === 0) {
            this.gamification.character.evolutionStage = Math.min(
                3,
                Math.floor(this.gamification.character.level / evolutionInterval)
            );
        }
    }

    return {
        xpAdded: xpToAdd,
        leveledUp: this.gamification.character.level,
        evolved: this.gamification.character.evolutionStage
    };
};

// Проверка доступа к фиче
userSchema.methods.hasAccess = function(feature) {
    const tierAccess = {
        free: ['basic_stats', 'character_lvl_3'],
        basic: ['basic_stats', 'character_lvl_15', 'export', 'charts', 'full_history'],
        premium: ['basic_stats', 'character_unlimited', 'export', 'charts', 'full_history',
            'ai_coach', 'leaderboard', 'challenges', 'custom_character'],
        pro: ['all']
    };

    // Trial даёт доступ к premium фичам
    if (this.subscription.trial.used &&
        this.subscription.trial.expiresAt > new Date()) {
        return tierAccess.premium.includes(feature) || feature === 'all';
    }

    const userTier = this.subscription.isActive ? this.subscription.tier : 'free';
    return tierAccess[userTier].includes(feature) || tierAccess[userTier].includes('all');
};

// Генерация реферального кода
userSchema.pre('save', function(next) {
    if (!this.marketing.referralCode) {
        this.marketing.referralCode = `REF_${this.telegramId}_${Date.now().toString(36)}`;
    }
    next();
});

module.exports = mongoose.model('User', userSchema);
