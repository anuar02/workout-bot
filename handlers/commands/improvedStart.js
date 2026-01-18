const User = require('../../models/User');
const characterShowcase = require('../../utils/characterShowcase');

async function handleImprovedStart(bot, msg, match) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const firstName = msg.from.first_name;
    const startParam = match[1] ? match[1].trim() : '';

    try {
        let user = await User.findOne({ telegramId });

        if (!user) {
            // ========== NEW USER ONBOARDING ==========
            console.log(`👋 New user: ${msg.from.username || firstName}`);

            user = new User({
                telegramId,
                username: msg.from.username,
                firstName,
                lastName: msg.from.last_name
            });

            // Handle referral
            if (startParam && startParam.startsWith('ref_')) {
                const referrerId = startParam.split('_')[1];
                user.marketing.referredBy = referrerId;
            }

            await user.save();

            // Step 1: Welcome message
            const welcomeMessage = 
                `👋 Привет, ${firstName}!\n\n` +
                `*GymAI* — твой AI напарник по тренировкам!\n\n` +
                `✅ Записывай тренировки ГОЛОСОМ 🎤\n` +
                `✅ Прокачивай своего персонажа\n` +
                `✅ Отслеживай прогресс\n` +
                `✅ Достигай целей ЛЕГКО\n\n` +
                `Готов начать? Выбери компаньона! 👇`;

            await bot.sendMessage(chatId, welcomeMessage, {
                parse_mode: 'Markdown'
            });

            // Small delay for better UX
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Step 2: Character showcase
            try {
                const showcasePath = await characterShowcase.generateShowcase();
                
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '🐱 Барсик', callback_data: 'select_character_cat' },
                            { text: '🐶 Рекс', callback_data: 'select_character_dog' }
                        ],
                        [
                            { text: '🦁 Лев', callback_data: 'select_character_lion' },
                            { text: '🦍 Конг', callback_data: 'select_character_gorilla' }
                        ]
                    ]
                };

                await bot.sendPhoto(chatId, showcasePath, {
                    caption: '🎮 *Выбери своего компаньона!*\n\nОн будет расти вместе с тобой',
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });

                // Cleanup temp file
                setTimeout(() => {
                    const fs = require('fs');
                    if (fs.existsSync(showcasePath)) {
                        fs.unlinkSync(showcasePath);
                    }
                }, 5000);

            } catch (error) {
                console.error('Error generating showcase:', error);
                // Fallback to text-only
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '🐱 Барсик - Новичкам', callback_data: 'select_character_cat' }
                        ],
                        [
                            { text: '🐶 Рекс - Универсал', callback_data: 'select_character_dog' }
                        ],
                        [
                            { text: '🦁 Лев - Опытным', callback_data: 'select_character_lion' }
                        ],
                        [
                            { text: '🦍 Конг - Пауэрлифтеры', callback_data: 'select_character_gorilla' }
                        ]
                    ]
                };

                await bot.sendMessage(chatId, '🎮 *Выбери персонажа:*', {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }

        } else {
            // ========== RETURNING USER ==========
            const gamificationService = require('../../services/gamification');
            const subscriptionService = require('../../services/subscription');
            const { getMainMenu } = require('../../utils/keyboard');

            const characterInfo = gamificationService.getCharacterInfo(user);
            const tier = subscriptionService.getEffectiveTier(user);

            let message = `👋 С возвращением, ${firstName}!\n\n`;

            if (characterInfo) {
                message += `${characterInfo.emoji} *${characterInfo.name}* — Lvl ${characterInfo.level}\n`;
                
                // Progress bar
                const progressPercent = Math.floor((characterInfo.xp / characterInfo.nextLevelXP) * 100);
                const barLength = 10;
                const filledBars = Math.floor(progressPercent / 10);
                const progressBar = '▓'.repeat(filledBars) + '░'.repeat(barLength - filledBars);
                
                message += `${progressBar} ${characterInfo.xp}/${characterInfo.nextLevelXP} XP\n\n`;
            }

            message += `📊 *Статистика:*\n`;
            message += `💪 Тренировок: ${user.stats.totalWorkouts}\n`;
            message += `🔥 Серия: ${user.stats.currentStreak} дней\n`;
            message += `🏆 Достижений: ${user.gamification.achievements.length}\n\n`;

            // Subscription status
            if (tier === 'free') {
                const voiceRemaining = 3 - (user.subscription.limits.voiceLogsThisMonth || 0);
                message += `📱 Free tier: ${voiceRemaining}/3 голосовых осталось\n`;
                message += `💎 Безлимит в Basic ($4.99/мес)\n\n`;
            } else {
                message += `💎 ${tier.toUpperCase()} подписка активна ✅\n\n`;
            }

            message += `Отправь голосовое или используй меню 👇`;

            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: getMainMenu(user)
            });
        }

        user.lastActive = new Date();
        await user.save();

    } catch (error) {
        console.error('❌ Error in /start:', error);
        await bot.sendMessage(chatId, '😕 Что-то пошло не так. Попробуй ещё раз.');
    }
}

module.exports = handleImprovedStart;
