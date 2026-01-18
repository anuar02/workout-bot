const User = require('../models/User');
const gamificationService = require('../services/gamification');
const subscriptionService = require('../services/subscription');
const paywallManager = require('../services/paywallManager');

async function celebrateFirstWorkout(bot, chatId, user) {
    // Only if it's actually the first workout
    if (user.stats.totalWorkouts !== 1) return false;

    try {
        const characterInfo = gamificationService.getCharacterInfo(user);

        // Send celebration message
        const message = 
            `🎊 *ПОЗДРАВЛЯЮ С ПЕРВОЙ ТРЕНИРОВКОЙ!* 🎊\n\n` +
            `${characterInfo.emoji} *${characterInfo.name}* уже получил +50 XP!\n\n` +
            `✨ Теперь ты в игре!\n\n` +
            `*Что дальше?*\n` +
            `🎤 Продолжай логировать тренировки\n` +
            `📊 Смотри статистику: /stats\n` +
            `📈 Отслеживай прогресс: /progress\n` +
            `🏆 Получай достижения\n\n` +
            `💪 Тренируйся регулярно — ${characterInfo.name} растёт вместе с тобой!`;

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📊 Моя статистика', callback_data: 'show_stats' }
                    ],
                    [
                        { text: '🎮 Мой персонаж', callback_data: 'show_character_info' }
                    ],
                    [
                        { text: '💎 Попробовать Premium', callback_data: 'activate_trial' }
                    ]
                ]
            }
        });

        // Mark onboarding complete
        user.onboarding.firstWorkoutRecorded = true;
        user.onboarding.completed = true;
        user.onboarding.currentStep = 2;
        await user.save();

        // Show trial offer after 5 seconds
        setTimeout(async () => {
            const shouldShow = await subscriptionService.shouldShowTrialOffer(user.telegramId);
            if (shouldShow) {
                await paywallManager.showTrialOffer(user, bot, chatId);
            }
        }, 5000);

        // Send tips over next 3 days
        scheduleOnboardingTips(bot, chatId, user);

        return true;

    } catch (error) {
        console.error('❌ Error celebrating first workout:', error);
        return false;
    }
}

function scheduleOnboardingTips(bot, chatId, user) {
    // Tip 1: Voice logging (Day 1, after 4 hours)
    setTimeout(async () => {
        await bot.sendMessage(chatId,
            `💡 *Совет дня:*\n\n` +
            `Используй голосовые сообщения — это в 10 раз быстрее!\n\n` +
            `Просто нажми 🎤 и скажи что делал в зале.\n` +
            `Я всё распознаю и запишу! 😎`,
            { parse_mode: 'Markdown' }
        );
    }, 4 * 60 * 60 * 1000);

    // Tip 2: Progress tracking (Day 2)
    setTimeout(async () => {
        await bot.sendMessage(chatId,
            `💡 *Совет дня:*\n\n` +
            `Хочешь увидеть свой прогресс?\n\n` +
            `Используй команду:\n` +
            `/progress жим лёжа\n\n` +
            `Я построю график твоих результатов! 📈`,
            { parse_mode: 'Markdown' }
        );
    }, 24 * 60 * 60 * 1000);

    // Tip 3: Consistency (Day 3)
    setTimeout(async () => {
        const updatedUser = await User.findOne({ telegramId: user.telegramId });
        const streak = updatedUser.stats.currentStreak;
        
        await bot.sendMessage(chatId,
            `💡 *Совет дня:*\n\n` +
            `Твоя серия: ${streak} ${streak === 1 ? 'день' : 'дней'} 🔥\n\n` +
            `Тренируйся регулярно, чтобы:\n` +
            `✅ Прокачать ${updatedUser.gamification.character.name} быстрее\n` +
            `✅ Получить достижения\n` +
            `✅ Видеть реальный прогресс\n\n` +
            `Продолжай в том же духе! 💪`,
            { parse_mode: 'Markdown' }
        );
    }, 3 * 24 * 60 * 60 * 1000);
}

module.exports = { 
    celebrateFirstWorkout,
    scheduleOnboardingTips
};
