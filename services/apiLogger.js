const fs = require('fs');
const path = require('path');

class APILogger {
    constructor() {
        this.logFile = path.join(__dirname, '../logs/api-usage.json');
        this.ensureLogFile();
    }

    ensureLogFile() {
        const dir = path.dirname(this.logFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(this.logFile)) {
            fs.writeFileSync(this.logFile, JSON.stringify({ logs: [], totalCost: 0 }, null, 2));
        }
    }

    log(type, cost, details = {}) {
        try {
            const logs = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));

            logs.logs.push({
                timestamp: new Date().toISOString(),
                type, // 'whisper', 'gpt', 'intent'
                cost,
                details
            });

            // Считаем общую стоимость
            const totalCost = logs.logs.reduce((sum, log) => sum + log.cost, 0);
            logs.totalCost = totalCost;

            fs.writeFileSync(this.logFile, JSON.stringify(logs, null, 2));

            console.log(`💰 API Call: ${type}, Cost: $${cost.toFixed(6)}, Total: $${totalCost.toFixed(2)}`);
        } catch (error) {
            console.error('⚠️ Ошибка логирования API:', error.message);
        }
    }

    getStats() {
        try {
            const logs = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
            return logs;
        } catch (error) {
            return { logs: [], totalCost: 0 };
        }
    }

    // Статистика за сегодня
    getTodayStats() {
        const stats = this.getStats();
        const today = new Date().toISOString().split('T')[0];

        const todayLogs = stats.logs.filter(log =>
            log.timestamp.startsWith(today)
        );

        const todayCost = todayLogs.reduce((sum, log) => sum + log.cost, 0);

        return {
            calls: todayLogs.length,
            cost: todayCost
        };
    }
}

module.exports = new APILogger();
