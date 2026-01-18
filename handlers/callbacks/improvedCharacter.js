const User = require('../../models/User');
const gamificationService = require('../../services/gamification');

async function handleImprovedCharacterSelection(bot, query) {
    const data = query.data;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const telegramId = query.from.id;
    const firstName = query.from.first_name;

    if (data.startsWith('select_character_')) {
        const characterType = data.replace('select_character_', '');
        
        try {
            const result = await gamificationService.selectCharacter(telegramId, characterType);

            await bot.answerCallbackQuery(query.id, {
                text: `✅ ${result.character} выбран!`
            });

            // Update message
            await bot.editMessageCaption(
                `✅ *${result.emoji} ${result.character} присоединился к команде!*\n\n` +
                `Вместе вы будете покорять новые высоты! 🚀`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown'
                }
            );

            // Small delay
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Step 3: First action prompt
            const actionMessage = 
                `🎉 *Отлично! Теперь самое интересное...*\n\n` +
                `Просто нажми 🎤 и *СКАЖИ свою последнюю тренировку*\n\n` +
                `*Например:*\n` +
                `_"Жим лёжа, три подхода по пятьдесят кило, двенадцать раз"_\n\n` +
                `Или пиши текстом:\n` +
                `\`Жим 3x50кг 12 раз\`\n\n` +
                `*Попробуй прямо сейчас!* 💪`;

            await bot.sendMessage(chatId, actionMessage, {
                parse_mode: 'Markdown'
            });

            // Mark onboarding progress
            const user = await User.findOne({ telegramId });
            if (user) {
                user.onboarding.characterSelected = true;
                user.onboarding.currentStep = 1;
                await user.save();
            }

            // Delayed tip (after 30 seconds if no workout logged)
            setTimeout(async () => {
                const updatedUser = await User.findOne({ telegramId });
                
                if (updatedUser && !updatedUser.onboarding.firstWorkoutRecorded) {
                    await bot.sendMessage(chatId,
                        `💡 *Подсказка:*\n\n` +
                        `Не переживай о формате - я умный бот! 🤖\n\n` +
                        `Говори естественно:\n` +
                        `• "Присед сто кило на пять"\n` +
                        `• "Тяга 90 на 8 три раза"\n` +
                        `• "Подтягивания 10 повторений"\n\n` +
                        `Я всё пойму! 😉`,
                        { parse_mode: 'Markdown' }
                    );
                }
            }, 30000);

        } catch (error) {
            console.error('❌ Error selecting character:', error);
            await bot.answerCallbackQuery(query.id, {
                text: '😕 Ошибка. Попробуй ещё раз',
                show_alert: true
            });
        }
    }
}

module.exports = { handleImprovedCharacterSelection };
