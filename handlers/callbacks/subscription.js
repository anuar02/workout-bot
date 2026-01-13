const subscriptionService = require('../../services/subscription');
const paywallManager = require('../../services/paywallManager');

async function handleSubscription(bot, query) {
    const data = query.data;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const telegramId = query.from.id;

    // Activate trial
    if (data === 'activate_trial') {
        const result = await subscriptionService.activateTrial(telegramId);

        if (result.success) {
            await bot.answerCallbackQuery(query.id, {
                text: '🎉 Trial активирован!'
            });

            await bot.editMessageText(
                `✅ ${result.message}\n\n` +
                `Теперь доступны все Premium фичи:\n` +
                `✨ AI-тренер\n` +
                `🏆 Челленджи\n` +
                `⚡ +50% XP\n` +
                `📊 Продвинутая статистика\n\n` +
                `Начинай тренироваться! 💪`,
                {
                    chat_id: chatId,
                    message_id: messageId
                }
            );
        } else {
            await bot.answerCallbackQuery(query.id, {
                text: result.message,
                show_alert: true
            });
        }
        return;
    }

    // Trial later
    if (data === 'trial_later') {
        await bot.answerCallbackQuery(query.id, {
            text: '👌 Хорошо, спросим позже!'
        });

        await bot.editMessageText(
            `👌 Без проблем!\n\n` +
            `Попробовать Premium можно в любой момент через /subscribe\n\n` +
            `А сейчас - записывай тренировки и прокачивай своего персонажа! 💪`,
            {
                chat_id: chatId,
                message_id: messageId
            }
        );
        return;
    }

    // Subscribe to tier
    if (data.startsWith('subscribe_')) {
        const parts = data.split('_');
        const tier = parts[1]; // basic, premium

        await bot.answerCallbackQuery(query.id);
        await paywallManager.createPaymentInvoice(bot, chatId, tier);
        return;
    }

    // Decline paywall
    if (data.startsWith('paywall_decline') || data === 'trial_decline') {
        await bot.answerCallbackQuery(query.id);

        await bot.sendMessage(chatId,
            `Помоги нам стать лучше! 📊\n\n` +
            `Почему не подписался?\n` +
            `1️⃣ Слишком дорого\n` +
            `2️⃣ Не нужны Premium фичи\n` +
            `3️⃣ Мало времени на тренировки\n` +
            `4️⃣ Другое (напиши)`
        );

        await paywallManager.saveDeclineReason(
            telegramId,
            data === 'trial_decline' ? 'trial_end' : 'paywall',
            'no_reason'
        );
    }
}

module.exports = { handleSubscription };
