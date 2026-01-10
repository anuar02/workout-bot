const User = require('../models/User');
const subscriptionService = require('./subscription');

class PaywallManager {

    // Показать paywall при достижении лимита
    async showLimitReachedPaywall(user, bot, chatId) {
        const stats = await subscriptionService.getPaywallStats(user.telegramId);

        const message = `🔒 *Лимит бесплатных тренировок исчерпан!*\n\n` +
            `За это время ты:\n` +
            `✅ Записал ${stats.workoutsRecorded} тренировок\n` +
            `✅ Прокачал ${user.gamification.character.name} до ${stats.characterLevel} уровня\n` +
            `✅ Держишь серию ${stats.currentStreak} дней подряд 🔥\n\n` +
            `*БЕЗ ПОДПИСКИ ТЫ ТЕРЯЕШЬ:*\n` +
            `❌ ${user.gamification.character.name} навсегда останется на ${stats.characterLevel} уровне\n` +
            `❌ Серия дней прервётся завтра\n` +
            `❌ Не сможешь записывать тренировки\n\n` +
            `💎 *BASIC подписка: $4.99/мес*\n` +
            `✅ Безлимит тренировок\n` +
            `✅ ${user.gamification.character.name} растёт до 15 уровня\n` +
            `✅ Графики прогресса\n` +
            `✅ Экспорт в Excel\n\n` +
            `🎁 *Оформи сейчас и получи 200 XP бонус!*`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '💎 Оформить Basic ($4.99)', callback_data: 'subscribe_basic' }
                ],
                [
                    { text: '🚀 Хочу Premium ($9.99)', callback_data: 'subscribe_premium' }
                ],
                [
                    { text: '❌ Нет, потерять прогресс', callback_data: 'paywall_decline_limit' }
                ]
            ]
        };

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    // Trial оффер (после первой тренировки)
    async showTrialOffer(user, bot, chatId) {
        // Проверяем что trial ещё не показывали
        const shouldShow = await subscriptionService.shouldShowTrialOffer(user.telegramId);

        if (!shouldShow) return false;

        const message = `🎉 *Отличное начало!*\n\n` +
            `Ты только что записал свою первую тренировку!\n\n` +
            `🎁 *ПОДАРОК: 7 дней Premium бесплатно*\n\n` +
            `Успей попробовать:\n` +
            `✨ AI-тренер (рекомендации после каждой тренировки)\n` +
            `🏆 Участие в челленджах\n` +
            `📊 Продвинутая статистика\n` +
            `⚡ ${user.gamification.character.name} растёт в 1.5 раза быстрее!\n` +
            `🎨 Уникальный персонаж\n\n` +
            `*Без привязки карты!*\n` +
            `В любой момент можно отменить.\n\n` +
            `Хочешь попробовать?`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🎁 Да! Активировать 7 дней Premium', callback_data: 'activate_trial' }
                ],
                [
                    { text: '🤔 Спросить позже', callback_data: 'trial_later' }
                ]
            ]
        };

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });

        // Отмечаем что показали
        await subscriptionService.markTrialOfferShown(user.telegramId);

        return true;
    }

    // Paywall при окончании trial
    async showTrialEndingPaywall(user, bot, chatId, hoursRemaining) {
        const stats = await subscriptionService.getPaywallStats(user.telegramId);

        const urgencyEmoji = hoursRemaining <= 12 ? '🚨' : '⏰';

        const message = `${urgencyEmoji} *ОСТАЛОСЬ ${hoursRemaining} ЧАСОВ PREMIUM*\n\n` +
            `За trial ты:\n` +
            `✅ Записал ${stats.workoutsRecorded} тренировок\n` +
            `✅ Прокачал ${user.gamification.character.name} до ${stats.characterLevel} уровня\n` +
            `✅ Получил ${stats.achievementsCount} достижений\n` +
            `✅ Держишь серию ${stats.currentStreak} дней 🔥\n\n` +
            `🔒 *ЗАВТРА ТЫ ПОТЕРЯЕШЬ:*\n\n` +
            `❌ ${user.gamification.character.name} замораживается на ${stats.characterLevel} уровне\n` +
            `   (до эволюции осталось ${15 - stats.characterLevel} уровней!)\n\n` +
            `❌ Серия ${stats.currentStreak} дней прервётся\n` +
            `   (ты в шаге от достижения "Железная воля"!)\n\n` +
            `❌ AI-тренер исчезнет\n` +
            `   (он помог улучшить результаты на 15%!)\n\n` +
            `❌ Вернёшься к лимиту 15 тренировок/месяц\n\n` +
            `💎 *СОХРАНИ ПРОГРЕСС: $4.99/мес*\n\n` +
            `🎁 *БОНУС при оплате сегодня:*\n` +
            `• Бейдж "Founder" (навсегда)\n` +
            `• 500 XP бонус (instant lvl up!)\n` +
            `• Эксклюзивный скин персонажа`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '💎 СОХРАНИТЬ ЗА $4.99', callback_data: 'subscribe_basic_trial_save' }
                ],
                [
                    { text: '🚀 Хочу Premium ($9.99)', callback_data: 'subscribe_premium_trial_save' }
                ],
                [
                    { text: '😢 Нет, потерять всё', callback_data: 'trial_decline' }
                ]
            ]
        };

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    // Recovery flow (после отказа от trial)
    async showTrialRecoveryOffer(user, bot, chatId) {
        const stats = await subscriptionService.getPaywallStats(user.telegramId);

        const message = `😢 *Trial закончился*\n\n` +
            `${user.gamification.character.name} заморожен на уровне ${stats.characterLevel}.\n` +
            `Серия дней прервалась.\n\n` +
            `*Но ещё не поздно!*\n\n` +
            `🎁 *ПОСЛЕДНИЙ ШАНС:*\n` +
            `Активируй подписку в течение 48 часов и получи:\n\n` +
            `• Восстановление серии дней! 🔥\n` +
            `• 300 XP бонус\n` +
            `• Скидка 10% на первый месяц\n\n` +
            `💎 *$4.49 вместо $4.99*\n\n` +
            `⏰ Предложение сгорает через 47:59:12`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '💎 ВЕРНУТЬ ПРОГРЕСС ($4.49)', callback_data: 'subscribe_recovery' }
                ],
                [
                    { text: 'Нет спасибо, я передумал', callback_data: 'recovery_decline_feedback' }
                ]
            ]
        };

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    // Soft paywall (мягкое предложение)
    async showSoftPaywall(user, bot, chatId, trigger) {
        let message = '';

        switch (trigger) {
            case 'character_frozen':
                message = `⚠️ ${user.gamification.character.name} замедлился!\n\n` +
                    `Без подписки он растёт в 3 раза медленнее.\n` +
                    `До следующего уровня: ${user.gamification.character.nextLevelXP - user.gamification.character.xp} XP\n\n` +
                    `💎 С подпиской: 150% скорости роста!\n` +
                    `⚡ Ускорь прогресс за $4.99/мес`;
                break;

            case 'achievement_locked':
                message = `🏆 *Новое достижение близко!*\n\n` +
                    `"Железная воля" - 30 дней подряд\n` +
                    `Осталось: ${30 - user.stats.currentStreak} дней\n\n` +
                    `⚠️ Без подписки достижения недоступны.\n\n` +
                    `💎 Разблокируй за $4.99/мес`;
                break;

            case 'export_attempt':
                message = `📊 *Экспорт доступен в Basic*\n\n` +
                    `Скачай все тренировки в Excel/CSV\n` +
                    `Анализируй прогресс\n` +
                    `Делись с тренером\n\n` +
                    `💎 Всего $4.99/мес`;
                break;
        }

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '💎 Разблокировать ($4.99)', callback_data: `subscribe_basic_${trigger}` }
                ],
                [
                    { text: 'Позже', callback_data: 'soft_paywall_later' }
                ]
            ]
        };

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    // Создать инвойс для оплаты
    async createPaymentInvoice(bot, chatId, tier, specialOffer = null) {
        const tiers = subscriptionService.getAllTiers();
        const tierConfig = tiers[tier];

        if (!tierConfig) {
            throw new Error(`Unknown tier: ${tier}`);
        }

        let price = tierConfig.priceStars;
        let title = `${tier.toUpperCase()} подписка`;
        let description = `Подписка на месяц`;

        // Применяем специальный оффер если есть
        if (specialOffer) {
            if (specialOffer.discount) {
                price = Math.floor(price * (1 - specialOffer.discount / 100));
                title = `${title} (-${specialOffer.discount}%)`;
                description = specialOffer.message || description;
            }
        }

        await bot.sendInvoice(
            chatId,
            title,
            description,
            `${tier}_monthly_${Date.now()}`, // payload
            '', // provider_token (пустой для Stars)
            'XTR', // currency (Telegram Stars)
            [{ label: 'Подписка на месяц', amount: price }],
            {
                photo_url: 'https://i.imgur.com/placeholder.jpg', // TODO: Заменить на реальную картинку
                need_email: false,
                need_phone_number: false,
                need_name: false,
                need_shipping_address: false,
                is_flexible: false
            }
        );
    }

    // Сохранить причину отказа (для аналитики)
    async saveDeclineReason(telegramId, stage, reason) {
        await User.findOneAndUpdate(
            { telegramId },
            {
                $push: {
                    'marketing.declines': {
                        stage,
                        reason,
                        date: new Date()
                    }
                }
            }
        );

        console.log(`📊 Decline: ${telegramId} - ${stage} - ${reason}`);
    }
}

module.exports = new PaywallManager();
