const User = require('../models/User');

async function ensureUser(chatId, telegramId) {
    let user = await User.findOne({ telegramId });
    if (!user) {
        throw new Error('USER_NOT_FOUND');
    }
    user.lastActive = new Date();
    await user.save();
    return user;
}

async function checkCharacterSelected(user) {
    return user.gamification.character.type !== null;
}

module.exports = {
    ensureUser,
    checkCharacterSelected
};
