const User = require('../../models/User');

// Temporary storage for profile setup state
const awaitingProfileInput = {};

async function handleProfileCommand(bot, msg) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
        const user = await User.findOne({ telegramId });

        if (!user) {
            return await bot.sendMessage(chatId, '⚠️ Сначала нажми /start');
        }

        // If profile exists, show it
        if (user.profile && user.profile.completedAt) {
            await showCurrentProfile(bot, chatId, user);
        } else {
            // Start profile setup
            await startProfileSetup(bot, chatId);
        }

    } catch (error) {
        console.error('❌ Ошибка /profile:', error);
        await bot.sendMessage(chatId, '😕 Ошибка при загрузке профиля.');
    }
}

async function startProfileSetup(bot, chatId) {
    const keyboard = {
        inline_keyboard: [
            [
                { text: '👨 Мужской', callback_data: 'profile_gender_male' },
                { text: '👩 Женский', callback_data: 'profile_gender_female' }
            ],
            [
                { text: '⏭️ Пропустить', callback_data: 'profile_skip' }
            ]
        ]
    };

    await bot.sendMessage(chatId,
        `👤 *НАСТРОЙКА ПРОФИЛЯ*\n\n` +
        `Это займёт 30 секунд и поможет показывать персональную статистику!\n\n` +
        `*Шаг 1/6:* Укажи свой пол`,
        {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        }
    );
}

async function showCurrentProfile(bot, chatId, user) {
    const profile = user.profile;

    // Calculate BMI if possible
    let bmi = null;
    let bmiStatus = '';

    if (profile.weight && profile.height) {
        const heightM = profile.height / 100;
        bmi = (profile.weight / (heightM * heightM)).toFixed(1);

        if (bmi < 18.5) bmiStatus = 'Недостаточный вес';
        else if (bmi < 25) bmiStatus = 'Нормальный вес';
        else if (bmi < 30) bmiStatus = 'Избыточный вес';
        else bmiStatus = 'Ожирение';
    }

    const goalNames = {
        'strength': 'Сила',
        'hypertrophy': 'Масса',
        'endurance': 'Выносливость',
        'weight_loss': 'Похудение',
        'general': 'Общая физ. форма'
    };

    const experienceNames = {
        'beginner': 'Новичок',
        'intermediate': 'Средний',
        'advanced': 'Продвинутый'
    };

    let message = `👤 *МОЙ ПРОФИЛЬ*\n\n`;

    if (profile.gender) {
        const genderEmoji = profile.gender === 'male' ? '👨' : '👩';
        message += `${genderEmoji} Пол: ${profile.gender === 'male' ? 'Мужской' : 'Женский'}\n`;
    }
    if (profile.age) message += `🎂 Возраст: ${profile.age} лет\n`;
    if (profile.height) message += `📏 Рост: ${profile.height} см\n`;
    if (profile.weight) message += `⚖️ Вес: ${profile.weight} кг\n`;
    if (bmi) message += `📊 BMI: ${bmi} (${bmiStatus})\n`;
    if (profile.goal) message += `🎯 Цель: ${goalNames[profile.goal] || profile.goal}\n`;
    if (profile.experience) message += `💪 Опыт: ${experienceNames[profile.experience] || profile.experience}\n`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: '✏️ Редактировать', callback_data: 'profile_edit_start' }
            ]
        ]
    };

    await bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
}

async function handleProfileCallback(bot, query) {
    const data = query.data;
    const chatId = query.message.chat.id;
    const telegramId = query.from.id;

    try {
        const user = await User.findOne({ telegramId });

        // Gender selection
        if (data.startsWith('profile_gender_')) {
            const gender = data.replace('profile_gender_', '');

            if (!user.profile) user.profile = {};
            user.profile.gender = gender;
            await user.save();

            await bot.answerCallbackQuery(query.id);
            await bot.editMessageText(
                `✅ Пол сохранён\n\n*Шаг 2/6:* Укажи свой возраст (10-100)`,
                {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown'
                }
            );

            awaitingProfileInput[chatId] = { type: 'age' };
            return;
        }

        // Goal selection
        if (data.startsWith('profile_goal_')) {
            const goal = data.replace('profile_goal_', '');

            user.profile.goal = goal;
            await user.save();

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🟢 Новичок', callback_data: 'profile_exp_beginner' }
                    ],
                    [
                        { text: '🟡 Средний', callback_data: 'profile_exp_intermediate' }
                    ],
                    [
                        { text: '🔴 Продвинутый', callback_data: 'profile_exp_advanced' }
                    ]
                ]
            };

            await bot.answerCallbackQuery(query.id);
            await bot.editMessageText(
                `✅ Цель сохранена\n\n*Шаг 6/6:* Укажи свой уровень`,
                {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
            return;
        }

        // Experience selection
        if (data.startsWith('profile_exp_')) {
            const experience = data.replace('profile_exp_', '');

            user.profile.experience = experience;
            user.profile.completedAt = new Date();
            await user.save();

            await bot.answerCallbackQuery(query.id);
            await bot.editMessageText(
                `✅ *Профиль готов!*\n\n` +
                `Теперь я смогу показывать тебе персональную статистику и рекомендации! 💪`,
                {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown'
                }
            );
            return;
        }

        // Skip profile
        if (data === 'profile_skip') {
            await bot.answerCallbackQuery(query.id, { text: 'Профиль можно заполнить позже через /profile' });
            await bot.deleteMessage(chatId, query.message.message_id);
        }

    } catch (error) {
        console.error('❌ Ошибка profile callback:', error);
        await bot.answerCallbackQuery(query.id, { text: '😕 Ошибка' });
    }
}

async function handleProfileInput(bot, msg) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    if (!awaitingProfileInput[chatId]) {
        return false; // Not awaiting profile input
    }

    const input = awaitingProfileInput[chatId];
    const text = msg.text;

    try {
        const user = await User.findOne({ telegramId });

        // Age input
        if (input.type === 'age') {
            const age = parseInt(text);

            if (isNaN(age) || age < 10 || age > 100) {
                await bot.sendMessage(chatId, '❌ Укажи возраст от 10 до 100');
                return true;
            }

            user.profile.age = age;
            await user.save();

            await bot.sendMessage(chatId,
                `✅ Возраст сохранён\n\n*Шаг 3/6:* Укажи свой рост (см, 100-250)`,
                { parse_mode: 'Markdown' }
            );

            awaitingProfileInput[chatId] = { type: 'height' };
            return true;
        }

        // Height input
        if (input.type === 'height') {
            const height = parseInt(text);

            if (isNaN(height) || height < 100 || height > 250) {
                await bot.sendMessage(chatId, '❌ Укажи рост от 100 до 250 см');
                return true;
            }

            user.profile.height = height;
            await user.save();

            await bot.sendMessage(chatId,
                `✅ Рост сохранён\n\n*Шаг 4/6:* Укажи свой вес (кг, 30-300)`,
                { parse_mode: 'Markdown' }
            );

            awaitingProfileInput[chatId] = { type: 'weight' };
            return true;
        }

        // Weight input
        if (input.type === 'weight') {
            const weight = parseInt(text);

            if (isNaN(weight) || weight < 30 || weight > 300) {
                await bot.sendMessage(chatId, '❌ Укажи вес от 30 до 300 кг');
                return true;
            }

            user.profile.weight = weight;
            await user.save();

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '💪 Сила', callback_data: 'profile_goal_strength' }
                    ],
                    [
                        { text: '🏋️ Масса', callback_data: 'profile_goal_hypertrophy' }
                    ],
                    [
                        { text: '🏃 Выносливость', callback_data: 'profile_goal_endurance' }
                    ],
                    [
                        { text: '📉 Похудение', callback_data: 'profile_goal_weight_loss' }
                    ],
                    [
                        { text: '🎯 Общая форма', callback_data: 'profile_goal_general' }
                    ]
                ]
            };

            await bot.sendMessage(chatId,
                `✅ Вес сохранён\n\n*Шаг 5/6:* Какая твоя цель?`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );

            delete awaitingProfileInput[chatId];
            return true;
        }

    } catch (error) {
        console.error('❌ Ошибка profile input:', error);
        await bot.sendMessage(chatId, '😕 Ошибка. Попробуй ещё раз.');
    }

    return false;
}

module.exports = {
    handleProfileCommand,
    handleProfileCallback,
    handleProfileInput,
    startProfileSetup,  // ← Export this!
    showCurrentProfile
};
