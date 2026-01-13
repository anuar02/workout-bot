const fs = require('fs');
const path = require('path');
const gamificationService = require('../services/gamification');
const subscriptionService = require('../services/subscription');
const chartGenerator = require('./chartGenerator');
const { getStatsKeyboard, getSubscriptionKeyboard, getSettingsKeyboard } = require('./keyboard');
const { formatProgressBar } = require('./formatters');

async function showCharacterInfo(bot, chatId, user) {
    const characterInfo = gamificationService.getCharacterInfo(user);

    if (!characterInfo) {
        return await bot.sendMessage(chatId, '⚠️ Сначала выбери персонажа через /start');
    }

    const tier = subscriptionService.getEffectiveTier(user);
    const imageLevel = Math.min(9, Math.floor(characterInfo.level / 2));
    const imagePath = path.join(__dirname, '..', 'assets', 'characters',
        `${user.gamification.character.type}_level_${imageLevel}.png`);

    const progressBar = formatProgressBar(characterInfo.xp, characterInfo.nextLevelXP);

    const message =
        `${characterInfo.emoji} *${characterInfo.name}*\n` +
        `${characterInfo.evolutionName} - Уровень ${characterInfo.level}\n\n` +
        `⚡ XP: ${progressBar}\n` +
        `${characterInfo.xp}/${characterInfo.nextLevelXP} (${characterInfo.progress}%)\n\n` +
        `📊 *Статистика:*\n` +
        `💪 Тренировок: ${user.stats.totalWorkouts}\n` +
        `🔥 Серия: ${user.stats.currentStreak} дней\n` +
        `🏆 Достижений: ${user.gamification.achievements.length}\n\n` +
        `💎 Подписка: *${tier.toUpperCase()}*`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: '📊 Статистика', callback_data: 'show_stats' },
                { text: '🏆 Достижения', callback_data: 'show_achievements' }
            ],
            [
                { text: '💎 Улучшить подписку', callback_data: 'upgrade_subscription' }
            ]
        ]
    };

    if (fs.existsSync(imagePath)) {
        await bot.sendPhoto(chatId, imagePath, {
            caption: message,
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    } else {
        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }
}

async function showStats(bot, chatId, stats) {
    if (stats.totalWorkouts === 0) {
        return await bot.sendMessage(chatId, '📊 Пока нет тренировок. Начни записывать!');
    }

    let message = `📊 *Статистика за месяц*\n\n`;
    message += `🏋️ Тренировок: ${stats.totalWorkouts}\n`;
    message += `💪 Общий объём: ${stats.totalVolume.toLocaleString()} кг\n\n`;
    message += `*Топ упражнений:*\n`;

    const topExercises = Object.entries(stats.exercises)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);

    topExercises.forEach(([name, data], i) => {
        const emoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i];
        message += `${emoji} ${name}\n`;
        message += `   ${data.count} раз • макс ${data.maxWeight}кг\n`;
    });

    await bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: getStatsKeyboard()
    });

    await bot.sendChatAction(chatId, 'upload_photo');
    const chart = await chartGenerator.generateVolumeChart(stats);
    await bot.sendPhoto(chatId, chart, {
        caption: `📈 Объём тренировок за месяц`
    });
}

async function showAchievements(bot, chatId, user) {
    const tier = subscriptionService.getEffectiveTier(user);
    const allAchievements = gamificationService.getAllAchievements(tier);
    const unlockedIds = user.gamification.achievements.map(a => a.id);

    let message = `🏆 *ДОСТИЖЕНИЯ*\n\n`;
    message += `Разблокировано: ${unlockedIds.length}/${allAchievements.length}\n\n`;

    message += `*✅ Получены:*\n`;
    const unlocked = allAchievements.filter(a => unlockedIds.includes(a.id));

    if (unlocked.length === 0) {
        message += `_Пока нет. Записывай тренировки!_\n\n`;
    } else {
        unlocked.forEach(achievement => {
            message += `${achievement.name}\n`;
            message += `_${achievement.description}_\n\n`;
        });
    }

    message += `*🎯 Ближайшие цели:*\n`;
    const locked = allAchievements.filter(a => !unlockedIds.includes(a.id)).slice(0, 3);

    locked.forEach(achievement => {
        message += `🔒 ${achievement.name}\n`;
        message += `_${achievement.description}_\n`;
        message += `Награда: +${achievement.xpReward} XP\n\n`;
    });

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

async function showProgressMenu(bot, chatId, user) {
    await bot.sendMessage(chatId,
        '📈 *ПРОГРЕСС ПО УПРАЖНЕНИЯМ*\n\n' +
        'Выбери упражнение или напиши название:',
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🏋️ Жим лёжа', callback_data: 'progress_жим лёжа' }
                    ],
                    [
                        { text: '🦵 Приседания', callback_data: 'progress_приседания' }
                    ],
                    [
                        { text: '💪 Тяга', callback_data: 'progress_тяга' }
                    ],
                    [
                        { text: '📊 Показать все', callback_data: 'progress_all' }
                    ]
                ]
            }
        }
    );
}

async function showPremiumInfo(bot, chatId, user) {
    const tier = subscriptionService.getEffectiveTier(user);

    if (tier !== 'free') {
        return await bot.sendMessage(chatId,
            `💎 У тебя *${tier.toUpperCase()}* подписка!\n\n` +
            `Действует до: ${user.subscription.expiresAt.toLocaleDateString('ru-RU')}\n\n` +
            `Всё работает отлично! 🎉`,
            { parse_mode: 'Markdown' }
        );
    }

    const message =
        `💎 *PREMIUM ПОДПИСКА*\n\n` +
        `🥉 *BASIC - $4.99/мес*\n` +
        `✅ Безлимит тренировок\n` +
        `✅ Персонаж до 15 lvl\n` +
        `✅ Графики + экспорт\n` +
        `✅ Вся история\n\n` +
        `🥇 *PREMIUM - $9.99/мес*\n` +
        `✅ Всё из Basic\n` +
        `✅ AI-тренер\n` +
        `✅ Безлимит уровней\n` +
        `✅ Челленджи\n` +
        `✅ +50% XP\n\n` +
        `🎁 *7 дней Premium бесплатно!*`;

    await bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: getSubscriptionKeyboard()
    });
}

async function showSettings(bot, chatId, user) {
    const tier = subscriptionService.getEffectiveTier(user);

    const message =
        `⚙️ *НАСТРОЙКИ*\n\n` +
        `🔔 Напоминания: ${user.settings.reminders.enabled ? '✅ Вкл' : '❌ Выкл'}\n` +
        `🌍 Язык: ${user.settings.language === 'ru' ? '🇷🇺 Русский' : '🇬🇧 English'}\n\n` +
        `💎 Подписка: ${tier.toUpperCase()}`;

    await bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: getSettingsKeyboard()
    });
}

module.exports = {
    showCharacterInfo,
    showStats,
    showAchievements,
    showProgressMenu,
    showPremiumInfo,
    showSettings
};
