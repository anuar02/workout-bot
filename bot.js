require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const cron = require('node-cron');

const subscriptionService = require('./services/subscription');
const exportService = require('./services/export');
const commandHandlers = require('./handlers/commands');
const messageHandlers = require('./handlers/messages');
const callbackHandlers = require('./handlers/callbacks');

// ========== GRACEFUL BOT INITIALIZATION ==========
let bot;
let isShuttingDown = false;

async function initializeBot() {
    try {
        bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
            polling: {
                interval: 300,
                autoStart: true,
                params: {
                    timeout: 10
                }
            }
        });

        console.log('🤖 Бот запущен!');
        return bot;
    } catch (error) {
        console.error('❌ Ошибка инициализации бота:', error);
        process.exit(1);
    }
}

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB подключена'))
    .catch(err => {
        console.error('❌ Ошибка MongoDB:', err);
        process.exit(1);
    });

// ========== IMPROVED ERROR HANDLING ==========
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
    if (!isShuttingDown) {
        gracefulShutdown();
    }
});

// ========== INITIALIZE BOT ==========
initializeBot().then(botInstance => {
    bot = botInstance;

    // Improved polling error handler
    bot.on('polling_error', (error) => {
        if (error.code === 'EFATAL') {
            console.error('⚠️ EFATAL: Критическая ошибка polling. Перезапуск через 5 сек...');

            if (!isShuttingDown) {
                setTimeout(async () => {
                    try {
                        await bot.stopPolling();
                        await initializeBot();
                        setupHandlers();
                    } catch (e) {
                        console.error('❌ Не удалось перезапустить бота:', e);
                        process.exit(1);
                    }
                }, 5000);
            }
        } else {
            console.error('⚠️ Polling error:', error.code, error.message);
        }
    });

    setupHandlers();
});

function setupHandlers() {
    // ========== COMMANDS ==========
    bot.onText(/\/start(.*)/, (msg, match) => commandHandlers.start(bot, msg, match));
    bot.onText(/\/profile/, (msg) => commandHandlers.profile(bot, msg));
    bot.onText(/\/stats( (.+))?/, (msg, match) => commandHandlers.stats(bot, msg, match));
    bot.onText(/\/progress( (.+))?/, (msg, match) => commandHandlers.progress(bot, msg, match));
    bot.onText(/\/export( (excel|csv))?/, (msg, match) => commandHandlers.exportData(bot, msg, match));
    bot.onText(/\/subscribe/, (msg) => commandHandlers.subscribe(bot, msg));
    bot.onText(/\/top/, (msg) => commandHandlers.top(bot, msg));
    bot.onText(/\/delete/, (msg) => commandHandlers.deleteWorkout(bot, msg));
    bot.onText(/\/edit/, (msg) => commandHandlers.edit(bot, msg));
    bot.onText(/\/help/, (msg) => commandHandlers.help(bot, msg));
    bot.onText(/\/costs/, (msg) => commandHandlers.costs(bot, msg));

    // ========== MESSAGE HANDLERS ==========
    bot.on('message', async (msg) => {
        if (msg.text && msg.text.startsWith('/')) return;
        await messageHandlers.handleMessage(bot, msg);
    });

    bot.on('voice', async (msg) => {
        await messageHandlers.handleVoice(bot, msg);
    });

    // ========== CALLBACK HANDLERS ==========
    bot.on('callback_query', async (query) => {
        await callbackHandlers.handleCallback(bot, query);
    });

    // ========== PAYMENT HANDLERS ==========
    bot.on('pre_checkout_query', async (query) => {
        await bot.answerPreCheckoutQuery(query.id, true);
    });

    bot.on('successful_payment', async (msg) => {
        await commandHandlers.handlePayment(bot, msg);
    });
}

// ========== CRON JOBS ==========
cron.schedule('0 0 * * *', async () => {
    console.log('⏰ Проверка истёкших подписок...');

    const User = require('./models/User');
    const expiredUsers = await User.find({
        'subscription.isActive': true,
        'subscription.tier': { $ne: 'free' },
        'subscription.expiresAt': { $lt: new Date() }
    });

    if (expiredUsers.length > 0) {
        for (const user of expiredUsers) {
            try {
                await bot.sendMessage(user.telegramId,
                    "⚠️ *Срок действия подписки истек*\n\n" +
                    "Твой персонаж загрустил, а продвинутая статистика больше недоступна. " +
                    "Продли подписку, чтобы продолжить тренировки на полную! 💪",
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {
                console.error(`Не удалось отправить сообщение ${user.telegramId}`);
            }
        }
    }

    const expiredCount = await subscriptionService.checkExpiredSubscriptions();
    console.log(`✅ Обработано ${expiredCount} истёкших подписок`);
});

cron.schedule('0 * * * *', () => {
    exportService.cleanupOldFiles();
});

// ========== GRACEFUL SHUTDOWN ==========
async function gracefulShutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('\n👋 Останавливаю бота...');

    try {
        if (bot) {
            await bot.stopPolling();
        }
        await mongoose.connection.close();
        console.log('✅ Бот остановлен корректно');
        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка при остановке:', error);
        process.exit(1);
    }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

module.exports = bot;
