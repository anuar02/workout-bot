const User = require('../../models/User');
const gamificationService = require('../../services/gamification');
const subscriptionService = require('../../services/subscription');
const { getMainMenu } = require('../../utils/keyboard');

async function handleStart(bot, msg, match) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const startParam = match[1] ? match[1].trim() : '';

    try {
        let user = await User.findOne({ telegramId });

        if (!user) {
            // New user
            console.log(`📝 Новый пользователь: ${msg.from.username || msg.from.first_name}`);

            user = new User({
                telegramId,
                username: msg.from.username,
                firstName: msg.from.first_name,
                lastName: msg.from.last_name
            });

            // Handle referral
            if (startParam && startParam.startsWith('ref_')) {
                const referrerId = startParam.split('_')[1];
                user.marketing.referredBy = referrerId;
            }

            await user.save();

            // Show character selection
            await bot.sendMessage(chatId,
                `🎉 Добро пожаловать, ${msg.from.first_name}!\n\n` +
                `💪 GymAI - твой умный помощник для тренировок!\n\n` +
                `Выбери своего тренировочного напарника:`
            );

            const characters = gamificationService.getAllCharacters();
            const keyboard = {
                inline_keyboard: Object.values(characters).map(char => ([
                    {
                        text: `${char.emoji} ${char.name} - ${char.description}`,
                        callback_data: `select_character_${char.id}`
                    }
                ]))
            };

            await bot.sendMessage(chatId,
                `Твой персонаж будет расти вместе с тобой! 🌟`,
                { reply_markup: keyboard }
            );

        } else {
            // Existing user
            const characterInfo = gamificationService.getCharacterInfo(user);
            const tier = subscriptionService.getEffectiveTier(user);

            let statusMessage = `👋 С возвращением, ${msg.from.first_name}!\n\n`;

            if (characterInfo) {
                statusMessage += `${characterInfo.emoji} ${characterInfo.name} - Lvl ${characterInfo.level}\n`;
                statusMessage += `XP: ${characterInfo.xp}/${characterInfo.nextLevelXP} `;
                statusMessage += `(${characterInfo.progress}%)\n\n`;
            }

            statusMessage += `💪 Всего тренировок: ${user.stats.totalWorkouts}\n`;
            statusMessage += `🔥 Серия: ${user.stats.currentStreak} дней\n`;
            statusMessage += `🏆 Достижений: ${user.gamification.achievements.length}\n\n`;

            if (tier === 'free') {
                const remaining = user.subscription.limits.workoutsLimit -
                    user.subscription.limits.workoutsThisMonth;
                statusMessage += `⚠️ Free tier: ${remaining}/${user.subscription.limits.workoutsLimit} тренировок осталось\n\n`;
            } else {
                statusMessage += `💎 ${tier.toUpperCase()} подписка активна\n\n`;
            }

            statusMessage += `Отправь голосовое или используй команды:\n`;
            statusMessage += `/stats /progress /export /top`;

            await bot.sendMessage(chatId, statusMessage, {
                parse_mode: 'Markdown',
                reply_markup: getMainMenu(user)
            });
        }

        user.lastActive = new Date();
        await user.save();

    } catch (error) {
        console.error('❌ Ошибка /start:', error);
        await bot.sendMessage(chatId, '😕 Ошибка при регистрации. Попробуй ещё раз.');
    }
}

module.exports = handleStart;
