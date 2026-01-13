const subscriptionService = require('../services/subscription');

function getMainMenu(user) {
    return {
        keyboard: [
            ['🎮 Мой персонаж', '📊 Статистика'],
            ['🏆 Достижения', '📈 Прогресс'],
            ['💎 Premium', '⚙️ Настройки']
        ],
        resize_keyboard: true,
        persistent: true
    };
}

function getCharacterSelectionKeyboard() {
    const gamificationService = require('../services/gamification');
    const characters = gamificationService.getAllCharacters();
    
    return {
        inline_keyboard: Object.values(characters).map(char => ([
            {
                text: `${char.emoji} ${char.name} - ${char.description}`,
                callback_data: `select_character_${char.id}`
            }
        ]))
    };
}

function getWorkoutActionsKeyboard(workoutId) {
    return {
        inline_keyboard: [
            [
                { text: '✏️ Заметка', callback_data: `add_note_${workoutId}` },
                { text: '😊 Настроение', callback_data: `add_feeling_${workoutId}` }
            ],
            [
                { text: '📅 Дата', callback_data: `change_date_${workoutId}` },
                { text: '✏️ Редактировать', callback_data: `edit_${workoutId}` }
            ],
            [
                { text: '🗑️ Удалить', callback_data: `delete_${workoutId}` }
            ]
        ]
    };
}

function getStatsKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: '📈 Графики', callback_data: 'show_charts' },
                { text: '📥 Экспорт', callback_data: 'export_data' }
            ]
        ]
    };
}

function getExportKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: '📊 Excel', callback_data: 'export_excel' },
                { text: '📄 CSV', callback_data: 'export_csv' }
            ]
        ]
    };
}

function getSubscriptionKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: '🎁 Попробовать 7 дней бесплатно', callback_data: 'activate_trial' }
            ],
            [
                { text: '🥉 Basic $4.99', callback_data: 'subscribe_basic' },
                { text: '🥇 Premium $9.99', callback_data: 'subscribe_premium' }
            ]
        ]
    };
}

function getSettingsKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: '🔔 Напоминания', callback_data: 'settings_reminders' },
                { text: '🌍 Язык', callback_data: 'settings_language' }
            ],
            [
                { text: '📥 Экспорт данных', callback_data: 'export_data' }
            ],
            [
                { text: '🗑️ Удалить аккаунт', callback_data: 'delete_account' }
            ]
        ]
    };
}

module.exports = {
    getMainMenu,
    getCharacterSelectionKeyboard,
    getWorkoutActionsKeyboard,
    getStatsKeyboard,
    getExportKeyboard,
    getSubscriptionKeyboard,
    getSettingsKeyboard
};
