// Central export for all command handlers

const profileHandler = require('./profile');

module.exports = {
    start: require('./start'),
    profile: profileHandler.handleProfileCommand,
    stats: require('./stats'),
    progress: require('./progress'),
    exportData: require('./export'),
    subscribe: require('./subscribe'),
    top: require('./top'),
    deleteWorkout: require('./delete'),
    edit: require('./edit'),
    help: require('./help'),
    costs: require('./costs'),
    handlePayment: require('./payment')
};
