// ===== middleware/telegramAuth.js =====
// Middleware to verify Telegram Mini App init data

const crypto = require('crypto');

function verifyTelegramWebAppData(req, res, next) {
    try {
        const initData = req.headers['x-telegram-init-data'];

        if (!initData) {
            return res.status(401).json({ error: 'Missing Telegram init data' });
        }

        // Parse init data
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        params.delete('hash');

        // Sort parameters
        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        // Compute HMAC-SHA256
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(process.env.TELEGRAM_BOT_TOKEN)
            .digest();

        const computedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        // Verify hash
        if (computedHash !== hash) {
            return res.status(401).json({ error: 'Invalid Telegram init data' });
        }

        // Parse user data
        const userStr = params.get('user');
        if (!userStr) {
            return res.status(401).json({ error: 'Missing user data' });
        }

        const user = JSON.parse(userStr);
        req.user = user;

        next();
    } catch (error) {
        console.error('Telegram auth error:', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
}

module.exports = { verifyTelegramWebAppData };
