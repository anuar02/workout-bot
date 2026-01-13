const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const User = require('../../models/User');
const Workout = require('../../models/Workout');
const parserService = require('../../services/parser');
const subscriptionService = require('../../services/subscription');
const gamificationService = require('../../services/gamification');
const paywallManager = require('../../services/paywallManager');
const { userContext } = require('../../utils/state');

async function handleVoice(bot, msg) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const fileId = msg.voice.file_id;

    try {
        const user = await User.findOne({ telegramId });
        if (!user) {
            return await bot.sendMessage(chatId, '⚠️ Сначала нажми /start для регистрации!');
        }

        // Check if character selected
        if (!user.gamification.character.type) {
            return await bot.sendMessage(chatId,
                '🎮 Сначала выбери персонажа!\n\n' +
                'Нажми /start и выбери своего компаньона 💪',
                {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🎮 Выбрать персонажа', callback_data: 'show_character_selection' }
                        ]]
                    }
                }
            );
        }

        // Check voice limits
        const limitCheck = await subscriptionService.checkWorkoutLimit(telegramId, true);

        if (!limitCheck.allowed) {
            await paywallManager.showLimitReachedPaywall(user, bot, chatId);
            return;
        }

        await bot.sendChatAction(chatId, 'typing');
        console.log(`📥 Войс от ${msg.from.username || msg.from.first_name}`);

        // Download and transcribe
        const file = await bot.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

        const response = await axios({
            method: 'get',
            url: fileUrl,
            responseType: 'stream'
        });

        const tempFilePath = path.join(os.tmpdir(), `voice_${Date.now()}.ogg`);
        const writer = fs.createWriteStream(tempFilePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        const text = await parserService.transcribe(tempFilePath);
        console.log('🎤 Транскрипция:', text);

        // Cleanup temp file
        try {
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
        } catch (e) {
            console.error('Ошибка при удалении темп-файла:', e);
        }

        // Check if it's a workout
        const { detectWorkoutIntent } = require('./text');
        const isWorkoutDescription = await detectWorkoutIntent(text);

        if (!isWorkoutDescription) {
            const { handleChatMessage } = require('./text');
            return await handleChatMessage(bot, { chat: { id: chatId } }, text);
        }

        // Parse workout - ТЕПЕРЬ МАССИВ
        const context = userContext[telegramId];
        const workouts = await parserService.parseWorkout(text, context);

        if (workouts.length === 0) {
            throw new Error('Не смог определить упражнение. Попробуй ещё раз!');
        }

        // Save all workouts
        const savedWorkouts = [];
        for (const workoutData of workouts) {
            const workout = new Workout({
                userId: user._id,
                telegramId,
                exercise: workoutData.exercise,
                sets: workoutData.sets,
                weight: workoutData.weight,
                reps: workoutData.reps,
                workoutDate: workoutData.workoutDate || new Date(),
                notes: workoutData.notes,
                feeling: workoutData.feeling,
                transcription: text,
                voiceDuration: msg.voice.duration
            });

            await workout.save();
            savedWorkouts.push(workout);
        }

        console.log(`💾 Сохранено ${savedWorkouts.length} подход(ов)`);

        // Update voice counter for free tier
        if (limitCheck.allowed) {
            const tier = subscriptionService.getEffectiveTier(user);
            if (tier === 'free') {
                user.subscription.limits.voiceLogsThisMonth =
                    (user.subscription.limits.voiceLogsThisMonth || 0) + 1;
            }
        }

        // Update stats
        user.stats.totalWorkouts += savedWorkouts.length;
        user.stats.monthlyWorkouts += savedWorkouts.length;
        user.lastActive = new Date();

        // Update streak
        await gamificationService.updateStreak(telegramId);

        // Award XP for all workouts
        let totalXP = 0;
        for (const workout of savedWorkouts) {
            const xpResult = await gamificationService.awardWorkoutXP(telegramId, workout);
            if (xpResult) {
                totalXP += xpResult.xpGained;
            }
        }

        await user.save();
        userContext[telegramId] = workouts[workouts.length - 1];

        // Get updated user and character info
        const updatedUser = await User.findOne({ telegramId });
        const characterInfo = gamificationService.getCharacterInfo(updatedUser);

        if (!characterInfo) {
            await bot.sendMessage(chatId,
                formatSimpleWorkoutConfirmation(workouts, savedWorkouts) +
                `\n\n⚠️ Выбери персонажа через /start для геймификации!`
            );
            return;
        }

        // Send confirmation with character
        const message = formatVoiceWorkoutConfirmation(
            workouts, savedWorkouts, updatedUser, totalXP, characterInfo, limitCheck
        );

        const { formatWorkoutWithCharacter } = require('../../utils/formatters');
        const imagePath = path.join(__dirname, '../../assets/characters',
            `${characterInfo.type}_${characterInfo.variant}.png`);

        if (fs.existsSync(imagePath)) {
            await bot.sendPhoto(chatId, imagePath, {
                caption: message,
                parse_mode: 'Markdown'
            });
        } else {
            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown'
            });
        }

        // Show profile setup and trial offer
        const shouldShowTrial = await subscriptionService.shouldShowTrialOffer(telegramId);
        if (shouldShowTrial) {
            setTimeout(async () => {
                const user = await User.findOne({ telegramId });

                if (!user.profile || !user.profile.completedAt) {
                    await bot.sendMessage(chatId,
                        `👤 Настрой профиль для персональных рекомендаций!\n\n` +
                        `Используй команду /profile`,
                        { parse_mode: 'Markdown' }
                    );

                    setTimeout(async () => {
                        await paywallManager.showTrialOffer(user, bot, chatId);
                    }, 5000);
                } else {
                    await paywallManager.showTrialOffer(user, bot, chatId);
                }
            }, 2000);
        }

    } catch (error) {
        console.error('❌ Ошибка обработки войса:', error);
        await bot.sendMessage(chatId,
            `😕 ${error.message || 'Что-то пошло не так. Попробуй ещё раз!'}`
        );
    }
}

function formatSimpleWorkoutConfirmation(workouts, savedWorkouts) {
    let message = '✅ Тренировка записана!\n\n';

    const grouped = {};
    workouts.forEach(w => {
        if (!grouped[w.exercise]) grouped[w.exercise] = [];
        grouped[w.exercise].push(w);
    });

    for (const [exercise, sets] of Object.entries(grouped)) {
        message += `📋 ${exercise}\n`;
        sets.forEach((set, idx) => {
            message += `${idx + 1}. ${set.weight || '-'}кг × ${set.reps || '-'} раз\n`;
        });
        message += '\n';
    }

    return message;
}

function formatVoiceWorkoutConfirmation(workouts, savedWorkouts, user, totalXP, characterInfo, limitCheck) {
    const grouped = {};
    workouts.forEach((w, i) => {
        if (!grouped[w.exercise]) {
            grouped[w.exercise] = [];
        }
        grouped[w.exercise].push({ ...w, _id: savedWorkouts[i]._id });
    });

    let message = '✅ *Записано!*\n\n';
    message += `📅 ${workouts[0].dateLabel || new Date().toLocaleDateString('ru-RU')}\n\n`;

    for (const [exercise, sets] of Object.entries(grouped)) {
        message += `📋 *${exercise.charAt(0).toUpperCase() + exercise.slice(1)}*\n`;

        sets.forEach((set, idx) => {
            const weight = set.weight ? `${set.weight} кг` : '-';
            const reps = set.reps || '-';
            const volume = (set.weight || 0) * (set.reps || 0);

            message += `   ${idx + 1}. ${weight} × ${reps}`;
            if (volume > 0) message += ` (${volume.toLocaleString()} кг)`;
            message += '\n';
        });

        const totalVolume = sets.reduce((sum, s) => sum + ((s.weight || 0) * (s.reps || 0)), 0);
        if (totalVolume > 0) {
            message += `   💪 ${totalVolume.toLocaleString()} кг\n`;
        }
        message += '\n';
    }

    // Stats
    const totalVolume = workouts.reduce((sum, w) => sum + ((w.weight || 0) * (w.reps || 0)), 0);
    message += `📊 Подходов: ${workouts.length} | Упражнений: ${Object.keys(grouped).length}\n`;
    if (totalVolume > 0) {
        message += `💪 Объём: ${totalVolume.toLocaleString()} кг\n`;
    }

    // Gamification
    if (characterInfo && totalXP > 0) {
        message += `\n🎮 *${characterInfo.name}* (+${totalXP} XP)\n`;
        message += `Уровень ${user.gamification.level}\n`;
    }

    if (user.gamification.streak > 1) {
        message += `🔥 Стрейк: ${user.gamification.streak} дней\n`;
    }

    // Limits
    if (limitCheck.remaining !== null) {
        message += `\n🎤 Осталось: ${limitCheck.remaining}/${limitCheck.limit} голосовых`;
    }

    return message;
}

module.exports = handleVoice;
