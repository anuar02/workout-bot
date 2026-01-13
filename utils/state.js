// Global state management

const awaitingInput = {};
const userContext = {};

const AWAITING_TIMEOUT = 5 * 60 * 1000; // 5 minutes

function setAwaitingInput(chatId, inputData) {
    // Clear previous timeout if exists
    if (awaitingInput[chatId]?.timeout) {
        clearTimeout(awaitingInput[chatId].timeout);
    }

    // Set new awaiting with timer
    awaitingInput[chatId] = {
        ...inputData,
        timeout: setTimeout(() => {
            if (awaitingInput[chatId]) {
                delete awaitingInput[chatId];
            }
        }, AWAITING_TIMEOUT)
    };
}

function clearAwaitingInput(chatId) {
    if (awaitingInput[chatId]?.timeout) {
        clearTimeout(awaitingInput[chatId].timeout);
    }
    delete awaitingInput[chatId];
}

function getAwaitingInput(chatId) {
    return awaitingInput[chatId];
}

function setUserContext(telegramId, context) {
    userContext[telegramId] = context;
}

function getUserContext(telegramId) {
    return userContext[telegramId];
}

module.exports = {
    awaitingInput,
    userContext,
    setAwaitingInput,
    clearAwaitingInput,
    getAwaitingInput,
    setUserContext,
    getUserContext
};
