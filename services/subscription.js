const User = require('../models/User');

// Конфигурация тиров
const SUBSCRIPTION_TIERS = {
    free: {
        price: 0,
        workoutsLimit: 15,
        characterMaxLevel: 3,
        features: {
            export: false,
            charts: false,
            aiCoach: false,
            leaderboard: false,
            challenges: false,
            fullHistory: false
        }
    },
    basic: {
        price: 4.99,
        priceStars: 149, // Telegram Stars (примерно $4.99)
        workoutsLimit: Infinity,
        characterMaxLevel: 15,
        features: {
            export: true,
            charts: true,
            aiCoach: false,
            leaderboard: false,
            challenges: false,
            fullHistory: true
        }
    },
    premium: {
        price: 9.99,
        priceStars: 299,
        workoutsLimit: Infinity,
        characterMaxLevel: Infinity,
        features: {
            export: true,
            charts: true,
            aiCoach: true,
            leaderboard: true,
            challenges: true,
            fullHistory: true,
            customCharacter: true
        }
    },
    pro: {
        price: 29.99,
        priceStars: 899,
        workoutsLimit: Infinity,
        characterMaxLevel: Infinity,
        features: {
            export: true,
            charts: true,
            aiCoach: true,
            leaderboard: true,
            challenges: true,
            fullHistory: true,
            customCharacter: true,
            multiUser: true,
            analytics: true,
            api: true
        }
    }
};

// Специальные офферы
const SPECIAL_OFFERS = {
    // Первое предложение trial
    trial_initial: {
        id: 'trial_7days_premium',
        duration: 7, // дней
        tier: 'premium',
        showAfterWorkouts: 1, // Показываем после первой тренировки
        expiresAfter: 30 // Доступен первые 30 дней
    },

    // Скидка при окончании trial
    trial_ending: {
        id: 'trial_ending_discount',
        discount: 20, // 20% скидка
        duration: 48, // часов
        message: '🎁 ПОСЛЕДНИЙ ШАНС: -20% на первый месяц!'
    },

    // Win-back после месяца неактивности
    winback_monthly: {
        id: 'winback_50percent',
        discount: 50,
        tier: 'premium',
        price: 4.99, // Premium по цене Basic
        message: '💎 Специально для тебя: Premium за $4.99 навсегда!',
        lifetime: true // Скидка навсегда
    },

    // Early adopter (первые 100 пользователей)
    early_adopter: {
        id: 'early_adopter',
        limit: 100,
        discount: 50,
        badge: 'Founder',
        message: '🎉 Ты в числе первых 100! Premium за $4.99'
    }
};

class SubscriptionService {

    // Активировать trial
    async activateTrial(telegramId) {
        try {
            const user = await User.findOne({ telegramId });

            if (!user) {
                throw new Error('Пользователь не найден');
            }

            // Проверяем что trial ещё не использован
            if (user.subscription.trial.used) {
                return {
                    success: false,
                    message: '⚠️ Trial уже был использован'
                };
            }

            // Активируем trial на 7 дней Premium
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

            user.subscription.trial.used = true;
            user.subscription.trial.startedAt = now;
            user.subscription.trial.expiresAt = expiresAt;
            user.subscription.trial.tier = 'premium';

            await user.save();

            console.log(`✅ Trial активирован для ${user.username}: до ${expiresAt}`);

            return {
                success: true,
                message: `🎉 7 дней Premium активированы!\nДоступ до: ${expiresAt.toLocaleDateString('ru-RU')}`,
                expiresAt
            };

        } catch (error) {
            console.error('❌ Ошибка активации trial:', error);
            throw error;
        }
    }

    // Проверка активности trial
    isTrialActive(user) {
        if (!user.subscription.trial.used) return false;

        const now = new Date();
        return user.subscription.trial.expiresAt > now;
    }

    // Проверка лимитов
    async checkWorkoutLimit(telegramId) {
        const user = await User.findOne({ telegramId });

        if (!user) return { allowed: false, reason: 'User not found' };

        // Trial или платная подписка - безлимит
        if (this.isTrialActive(user) ||
            (user.subscription.isActive && user.subscription.tier !== 'free')) {
            return { allowed: true };
        }

        // Free tier - проверяем лимит
        const canRecord = user.canRecordWorkout();

        if (!canRecord) {
            const remaining = user.subscription.limits.workoutsLimit -
                user.subscription.limits.workoutsThisMonth;

            return {
                allowed: false,
                reason: 'limit_reached',
                message: `🔒 Лимит исчерпан!\n\n` +
                    `Записано ${user.subscription.limits.workoutsThisMonth}/${user.subscription.limits.workoutsLimit} тренировок.\n\n` +
                    `💎 Оформи подписку для безлимита!`,
                workoutsRecorded: user.subscription.limits.workoutsThisMonth,
                workoutsLimit: user.subscription.limits.workoutsLimit
            };
        }

        return {
            allowed: true,
            remaining: user.subscription.limits.workoutsLimit -
                user.subscription.limits.workoutsThisMonth - 1
        };
    }

    // Увеличить счётчик тренировок
    async incrementWorkoutCount(telegramId) {
        const user = await User.findOne({ telegramId });

        if (!user) return;

        // Увеличиваем только для free tier
        if (!user.subscription.isActive || user.subscription.tier === 'free') {
            user.subscription.limits.workoutsThisMonth += 1;
            await user.save();
        }
    }

    // Создать подписку после оплаты
    async createSubscription(telegramId, tier, paymentData) {
        try {
            const user = await User.findOne({ telegramId });

            if (!user) {
                throw new Error('Пользователь не найден');
            }

            const now = new Date();
            const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 дней

            // Сохраняем платёж
            user.subscription.payments.push({
                amount: paymentData.amount,
                currency: paymentData.currency,
                tier: tier,
                status: 'completed',
                telegramPaymentId: paymentData.telegramPaymentId,
                provider: 'telegram_stars'
            });

            // Активируем подписку
            user.subscription.tier = tier;
            user.subscription.isActive = true;
            user.subscription.startedAt = now;
            user.subscription.expiresAt = expiresAt;
            user.subscription.autoRenew = true;

            // Снимаем лимиты
            user.subscription.limits.workoutsLimit = Infinity;

            await user.save();

            console.log(`💰 Подписка создана: ${user.username} → ${tier} до ${expiresAt}`);

            return {
                success: true,
                tier,
                expiresAt,
                message: `🎉 Подписка ${tier.toUpperCase()} активирована!\nДействует до: ${expiresAt.toLocaleDateString('ru-RU')}`
            };

        } catch (error) {
            console.error('❌ Ошибка создания подписки:', error);
            throw error;
        }
    }

    // Проверка истёкших подписок (запускать ежедневно cron)
    async checkExpiredSubscriptions() {
        const now = new Date();

        const expiredUsers = await User.find({
            'subscription.isActive': true,
            'subscription.expiresAt': { $lt: now }
        });

        for (const user of expiredUsers) {
            user.subscription.isActive = false;
            user.subscription.tier = 'free';
            user.subscription.limits.workoutsLimit = 15;

            await user.save();

            console.log(`⏰ Подписка истекла: ${user.username}`);

            // TODO: Отправить уведомление пользователю
        }

        return expiredUsers.length;
    }

    // Получить эффективный tier (с учётом trial)
    getEffectiveTier(user) {
        if (this.isTrialActive(user)) {
            return user.subscription.trial.tier;
        }

        if (user.subscription.isActive) {
            return user.subscription.tier;
        }

        return 'free';
    }

    // Проверка доступа к фиче
    hasFeatureAccess(user, feature) {
        const tier = this.getEffectiveTier(user);
        return SUBSCRIPTION_TIERS[tier]?.features[feature] || false;
    }

    // Получить статистику для paywall
    async getPaywallStats(telegramId) {
        const user = await User.findOne({ telegramId });

        if (!user) return null;

        return {
            workoutsRecorded: user.stats.totalWorkouts,
            characterLevel: user.gamification.character.level,
            currentStreak: user.stats.currentStreak,
            achievementsCount: user.gamification.achievements.length,
            daysUsing: Math.floor((Date.now() - user.createdAt) / (1000 * 60 * 60 * 24))
        };
    }

    // Показать ли trial оффер
    async shouldShowTrialOffer(telegramId) {
        const user = await User.findOne({ telegramId });

        if (!user) return false;

        // Уже использовал trial
        if (user.subscription.trial.used) return false;

        // Уже платный
        if (user.subscription.isActive && user.subscription.tier !== 'free') return false;

        // Показываем после первой тренировки
        if (user.stats.totalWorkouts >= 1 && !user.subscription.trial.offerShownAt) {
            return true;
        }

        return false;
    }

    // Отметить что показали trial оффер
    async markTrialOfferShown(telegramId) {
        await User.findOneAndUpdate(
            { telegramId },
            { 'subscription.trial.offerShownAt': new Date() }
        );
    }

    // Получить конфигурацию тиров
    getTierConfig(tier) {
        return SUBSCRIPTION_TIERS[tier];
    }

    // Получить все тиры
    getAllTiers() {
        return SUBSCRIPTION_TIERS;
    }
}

module.exports = new SubscriptionService();
