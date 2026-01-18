const characterCallbacks = require('./character');
const subscriptionCallbacks = require('./subscription');
const workoutCallbacks = require('./workout');
const settingsCallbacks = require('./settings');
const improvedCharacter = require('./improvedCharacter');
const profileHandler = require('../commands/profile');

async function handleCallback(bot, query) {
    const data = query.data;

    try {
        // 1) Settings & account FIRST
        if (
            data.startsWith('settings_') ||
            data === 'delete_account' ||
            data === 'confirm_delete_account' ||
            data === 'cancel_delete_account'
        ) {
            return await settingsCallbacks.handleSettings(bot, query);
        }

        // 2) Workout actions AFTER
        if (
            data.startsWith('add_note_') ||
            data.startsWith('add_feeling_') ||
            data.startsWith('feeling_') ||
            data.startsWith('change_date_') ||
            data.startsWith('date_') ||
            data.startsWith('date_custom_') ||
            data.startsWith('edit_') ||
            data.startsWith('delete_') ||
            data.startsWith('confirm_delete_') ||
            data === 'cancel_delete'
        ) {
            return await workoutCallbacks.handleWorkout(bot, query);
        }
        // Character selection
        if (data.startsWith('select_character_') || data === 'show_character_selection') {
            return await improvedCharacter.handleImprovedCharacterSelection(bot, query);
        }

        // Profile
        if (data.startsWith('profile_')) {
            return await profileHandler.handleProfileCallback(bot, query);
        }

        // Subscription/trial
        if (data.startsWith('subscribe_') || data === 'activate_trial' || data === 'trial_later' ||
            data.startsWith('paywall_decline') || data === 'trial_decline') {
            return await subscriptionCallbacks.handleSubscription(bot, query);
        }

        // Stats & exports
        if (data === 'show_stats' || data === 'show_achievements' ||
            data === 'export_data' || data === 'export_excel' || data === 'export_csv') {
            return await require('./stats').handleStats(bot, query);
        }

        // Progress
        if (data.startsWith('progress_')) {
            return await require('./progress').handleProgress(bot, query);
        }

        // Unknown callback
        console.log(`⚠️ Неизвестный callback: ${data}`);
        await bot.answerCallbackQuery(query.id, { text: '🤔 Неизвестная команда' });

    } catch (error) {
        console.error('❌ Ошибка callback:', error);
        await bot.answerCallbackQuery(query.id, { text: '😕 Ошибка' });
    }
}

module.exports = { handleCallback };
