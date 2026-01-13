const User = require('../../models/User');
const subscriptionService = require('../../services/subscription');
const { getSubscriptionKeyboard } = require('../../utils/keyboard');

async function handleSubscribe(bot, msg) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
        const user = await User.findOne({ telegramId });
        if (!user) {
            return await bot.sendMessage(chatId, '⚠️ Сначала нажми /start');
        }

        const tier = subscriptionService.getEffectiveTier(user);

        if (tier !== 'free' && user.subscription.isActive) {
            return await bot.sendMessage(chatId,
                `💎 У тебя уже есть ${tier.toUpperCase()} подписка!\n\n` +
                `Действует до: ${user.subscription.expiresAt.toLocaleDateString('ru-RU')}`
            );
        }

        const message = `💎 *ВЫБЕРИ ПОДПИСКУ*\n\n` +
            `🥉 *BASIC - $4.99/мес*\n` +
            `✅ Безлимит тренировок\n` +
            `✅ Персонаж до 15 lvl\n` +
            `✅ Графики + экспорт\n\n` +
            `🥇 *PREMIUM - $9.99/мес* 🔥\n` +
            `✅ Всё из Basic\n` +
            `✅ AI-персональный тренер\n` +
            `✅ Безлимит уровней\n` +
            `✅ Челленджи + лидерборд\n` +
            `✅ +50% XP бонус\n\n` +
            `💰 Все платежи через Telegram Stars`;

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: getSubscriptionKeyboard()
        });

    } catch (error) {
        console.error('❌ Ошибка /subscribe:', error);
        await bot.sendMessage(chatId, '😕 Ошибка. Попробуй ещё раз.');
    }
}

module.exports = handleSubscribe;
