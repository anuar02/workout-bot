const User = require('../../models/User');
const subscriptionService = require('../../services/subscription');
const gamificationService = require('../../services/gamification');

async function handlePayment(bot, msg) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const payment = msg.successful_payment;

    try {
        console.log('💰 Успешная оплата:', payment);

        const payload = payment.invoice_payload;
        const tier = payload.split('_')[0];

        const result = await subscriptionService.createSubscription(
            telegramId,
            tier,
            {
                amount: payment.total_amount,
                currency: payment.currency,
                telegramPaymentId: payment.telegram_payment_charge_id
            }
        );

        if (result.success) {
            const user = await User.findOne({ telegramId });
            const characterInfo = gamificationService.getCharacterInfo(user);

            await user.addXP(500);
            await user.save();

            await bot.sendMessage(chatId,
                `🎉 *ПОДПИСКА АКТИВИРОВАНА!*\n\n` +
                `${result.message}\n\n` +
                `🎁 *БОНУСЫ:*\n` +
                `✅ +500 XP начислено!\n` +
                `✅ ${characterInfo.name} получил бейдж "Supporter"\n` +
                `✅ Все лимиты сняты\n\n` +
                `Теперь тренируйся без ограничений! 💪`,
                { parse_mode: 'Markdown' }
            );
        }

    } catch (error) {
        console.error('❌ Ошибка обработки платежа:', error);
        await bot.sendMessage(chatId,
            '😕 Что-то пошло не так с подпиской. Напиши в поддержку!'
        );
    }
}

module.exports = handlePayment;
