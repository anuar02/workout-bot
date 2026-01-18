const heatmapGenerator = require('../utils/heatmapGenerator');

class MilestoneCelebrations {

    async checkAndCelebrate(bot, chatId, user) {
        const milestones = [
            { workouts: 7, message: '🎉 *7 тренировок!*\n\nТы на правильном пути! Смотри свой прогресс:' },
            { workouts: 14, message: '🔥 *2 недели тренировок!*\n\nОтличный старт! Вот твоя активность:' },
            { workouts: 30, message: '💪 *30 тренировок!*\n\nТы превращаешь это в привычку! Смотри:' },
            { workouts: 50, message: '🏆 *50 тренировок!*\n\nПолтинник! Ты машина! Вот доказательство:' },
            { workouts: 100, message: '👑 *СОТКА!*\n\nТы официально ЦЕНТУРИОН! Смотри свой путь:' }
        ];

        const currentWorkouts = user.stats.totalWorkouts;

        // Check if we hit a milestone
        const milestone = milestones.find(m => m.workouts === currentWorkouts);

        if (!milestone) return false;

        try {
            // Send celebration message
            await bot.sendMessage(chatId, milestone.message, {
                parse_mode: 'Markdown'
            });

            // Small delay for effect
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Generate and send heatmap
            const heatmapPath = await heatmapGenerator.generateHeatmap(
                user.telegramId,
                Math.min(currentWorkouts * 2, 180) // Show longer period for higher milestones
            );

            const gamificationService = require('./gamification');
            const characterInfo = gamificationService.getCharacterInfo(user);

            await bot.sendPhoto(chatId, heatmapPath, {
                caption:
                    `🎊 ${characterInfo.emoji} *${characterInfo.name}* гордится тобой!\n\n` +
                    `📊 ${currentWorkouts} тренировок записано\n` +
                    `🔥 Серия: ${user.stats.currentStreak} дней\n` +
                    `📈 Уровень: ${characterInfo.level}\n\n` +
                    `Продолжай в том же духе! 💪`,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🎮 Мой персонаж', callback_data: 'show_character_info' }
                        ],
                        [
                            { text: '🏆 Достижения', callback_data: 'show_achievements' }
                        ],
                        [
                            { text: '💎 Premium фичи', callback_data: 'show_premium_info' }
                        ]
                    ]
                }
            });

            // Cleanup
            setTimeout(() => {
                heatmapGenerator.cleanup(heatmapPath);
            }, 5000);

            console.log(`🎉 Milestone celebration: ${user.username} - ${currentWorkouts} workouts`);
            return true;

        } catch (error) {
            console.error('❌ Error celebrating milestone:', error);
            return false;
        }
    }

    async celebrateStreak(bot, chatId, user, streakDays) {
        const streakMilestones = [7, 14, 30, 60, 90, 180, 365];

        if (!streakMilestones.includes(streakDays)) return false;

        try {
            let message = '';
            let emoji = '';

            if (streakDays === 7) {
                emoji = '🔥';
                message = 'НЕДЕЛЯ БЕЗ ПРОПУСКОВ!';
            } else if (streakDays === 14) {
                emoji = '⚡';
                message = '2 НЕДЕЛИ ПОДРЯД!';
            } else if (streakDays === 30) {
                emoji = '💪';
                message = 'МЕСЯЦ СИЛЫ!';
            } else if (streakDays === 60) {
                emoji = '🏆';
                message = 'ДВА МЕСЯЦА НОНСТОП!';
            } else if (streakDays >= 90) {
                emoji = '👑';
                message = `${streakDays} ДНЕЙ! ТЫ ЛЕГЕНДА!`;
            }

            await bot.sendMessage(chatId,
                `${emoji} *${message}*\n\n` +
                `Смотри как выглядит настоящая дисциплина:`,
                { parse_mode: 'Markdown' }
            );

            const heatmapPath = await heatmapGenerator.generateHeatmap(user.telegramId, Math.min(streakDays + 30, 180));

            await bot.sendPhoto(chatId, heatmapPath, {
                caption:
                    `🔥 *Серия: ${streakDays} дней!*\n\n` +
                    `Это не случайность — это характер! 💪\n\n` +
                    `Не останавливайся сейчас!`,
                parse_mode: 'Markdown'
            });

            setTimeout(() => {
                heatmapGenerator.cleanup(heatmapPath);
            }, 5000);

            return true;

        } catch (error) {
            console.error('❌ Error celebrating streak:', error);
            return false;
        }
    }
}

module.exports = new MilestoneCelebrations();
