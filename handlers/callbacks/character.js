const User = require('../../models/User');
const gamificationService = require('../../services/gamification');
const paywallManager = require('../../services/paywallManager');
const profileHandler = require('../commands/profile');
const { getCharacterSelectionKeyboard } = require('../../utils/keyboard');

async function handleCharacter(bot, query) {
    const data = query.data;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const telegramId = query.from.id;

    if (data === 'show_character_selection') {
        await bot.answerCallbackQuery(query.id);

        await bot.sendMessage(chatId,
            `🎮 *Выбери своего компаньона*\n\n` +
            `Он будет расти вместе с тобой! 💪`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
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
                }
            }
        );

        setTimeout(async () => {
            await bot.sendMessage(chatId,
                `📖 *Описание персонажей:*\n\n` +
                `🐱 *Барсик* - Ловкий котик (для новичков)\n` +
                `🐶 *Рекс* - Сильный пёс (универсал)\n` +
                `🦁 *Лев* - Царь зала (для опытных)\n` +
                `🦍 *Конг* - Мощная горилла (пауэрлифтеры)`,
                { parse_mode: 'Markdown' }
            );
        }, 1000);

        return;
    }

    if (data.startsWith('select_character_')) {
        const characterType = data.replace('select_character_', '');
        const result = await gamificationService.selectCharacter(telegramId, characterType);

        await bot.answerCallbackQuery(query.id, {
            text: `✅ Выбран ${result.character}!`
        });

        await bot.editMessageText(
            `✅ Отлично! Теперь ${result.emoji} ${result.character} - твой напарник!\n\n` +
            `Он будет расти вместе с тобой. Чем больше тренировок - тем сильнее становится!`,
            {
                chat_id: chatId,
                message_id: messageId
            }
        );

        // Show profile setup after character selection
        setTimeout(async () => {
            const user = await User.findOne({ telegramId });

            // Check if profile not completed
            if (!user.profile || !user.profile.completedAt) {
                await bot.sendMessage(chatId,
                    `👤 *НАСТРОЙКА ПРОФИЛЯ*\n\n` +
                    `Это займёт 30 секунд и поможет мне давать тебе персональные рекомендации!\n\n` +
                    `Начнём? Используй команду /profile`,
                    { parse_mode: 'Markdown' }
                );
            }

            // Then show trial offer
            setTimeout(async () => {
                const updatedUser = await User.findOne({ telegramId });
                await paywallManager.showTrialOffer(updatedUser, bot, chatId);
            }, 5000);
        }, 2000);
    }
}

module.exports = { handleCharacter };
