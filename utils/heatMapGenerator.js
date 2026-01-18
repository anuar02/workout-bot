const { createCanvas } = require('canvas');
const { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth } = require('date-fns');
const { ru } = require('date-fns/locale');
const Workout = require('../models/Workout');
const path = require('path');
const fs = require('fs');

class HeatmapGenerator {
    constructor() {
        // Увеличенные размеры для лучшей читаемости
        this.cellSize = 18;
        this.cellGap = 4;
        this.paddingTop = 80;
        this.paddingLeft = 80;
        this.paddingRight = 40;
        this.paddingBottom = 100;

        // GitHub-style colors (более насыщенные)
        this.colors = {
            empty: '#ebedf0',
            level1: '#9be9a8',
            level2: '#40c463',
            level3: '#30a14e',
            level4: '#216e39'
        };

        this.tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async generateHeatmap(telegramId, days = 90) {
        try {
            // Fetch workouts
            const startDate = subDays(new Date(), days);
            const workouts = await Workout.find({
                telegramId,
                createdAt: { $gte: startDate }
            });

            // Group by date
            const heatmapData = {};
            workouts.forEach(w => {
                const dateKey = format(w.createdAt, 'yyyy-MM-dd');
                heatmapData[dateKey] = (heatmapData[dateKey] || 0) + 1;
            });

            // Calculate streak
            const streak = this.calculateStreak(heatmapData);

            // Generate calendar grid data
            const calendarData = this.generateCalendarData(startDate, days, heatmapData);

            // Calculate canvas size
            const weeks = Math.ceil(calendarData.length / 7);
            const width = this.paddingLeft + weeks * (this.cellSize + this.cellGap) + this.paddingRight;
            const height = this.paddingTop + 7 * (this.cellSize + this.cellGap) + this.paddingBottom;

            // Create canvas
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            // Background with subtle gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(1, '#f6f8fa');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);

            // Title
            ctx.fillStyle = '#24292f';
            ctx.font = 'bold 24px Arial';
            ctx.fillText('📅 Календарь Активности', this.paddingLeft, 40);

            // Subtitle
            ctx.fillStyle = '#57606a';
            ctx.font = '16px Arial';
            ctx.fillText('Последние 3 месяца', this.paddingLeft, 60);

            // Month labels
            this.drawMonthLabels(ctx, calendarData, weeks);

            // Day labels
            this.drawDayLabels(ctx);

            // Grid cells
            this.drawGrid(ctx, calendarData, weeks);

            // Legend
            this.drawLegend(ctx, width, height);

            // Streak info (prominent)
            if (streak > 0) {
                this.drawStreakBanner(ctx, width, height, streak);
            }

            // Stats
            const totalWorkouts = Object.values(heatmapData).reduce((sum, count) => sum + count, 0);
            const activeDays = Object.keys(heatmapData).length;

            ctx.fillStyle = '#57606a';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(
                `💪 ${totalWorkouts} ${this.getWorkoutsWord(totalWorkouts)} за ${activeDays} ${this.getDaysWord(activeDays)}`,
                this.paddingLeft,
                height - 60
            );

            // Save to file
            const buffer = canvas.toBuffer('image/png');
            const filename = path.join(this.tempDir, `heatmap_${telegramId}_${Date.now()}.png`);
            fs.writeFileSync(filename, buffer);

            console.log(`✅ Heatmap generated: ${filename}`);
            return filename;

        } catch (error) {
            console.error('❌ Error generating heatmap:', error);
            throw error;
        }
    }

    generateCalendarData(startDate, days, heatmapData) {
        // Align to start of week (Monday)
        const weekStart = startOfWeek(startDate, { weekStartsOn: 1 });
        const endDate = new Date();
        const weekEnd = endOfWeek(endDate, { weekStartsOn: 1 });

        const allDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

        return allDays.map(date => {
            const dateKey = format(date, 'yyyy-MM-dd');
            const count = heatmapData[dateKey] || 0;

            return {
                date,
                dateKey,
                count,
                color: this.getColor(count),
                month: format(date, 'MMM', { locale: ru }),
                dayOfWeek: date.getDay() === 0 ? 7 : date.getDay(), // Monday = 1, Sunday = 7
                isToday: dateKey === format(new Date(), 'yyyy-MM-dd')
            };
        });
    }

    drawMonthLabels(ctx, calendarData, weeks) {
        ctx.fillStyle = '#24292f';
        ctx.font = 'bold 14px Arial';

        let lastMonth = '';
        let weekIndex = 0;
        let dayInWeek = 0;

        for (let i = 0; i < calendarData.length; i++) {
            const cell = calendarData[i];

            // Draw month label at the start of each month
            if (cell.month !== lastMonth && cell.dayOfWeek === 1) {
                const x = this.paddingLeft + weekIndex * (this.cellSize + this.cellGap);
                ctx.fillText(cell.month, x, this.paddingTop - 15);
                lastMonth = cell.month;
            }

            dayInWeek++;
            if (dayInWeek === 7) {
                weekIndex++;
                dayInWeek = 0;
            }
        }
    }

    drawDayLabels(ctx) {
        ctx.fillStyle = '#57606a';
        ctx.font = '13px Arial';

        const days = ['Пн', '', 'Ср', '', 'Пт', '', ''];

        days.forEach((day, index) => {
            if (day) {
                const y = this.paddingTop + index * (this.cellSize + this.cellGap) + this.cellSize - 3;
                ctx.fillText(day, 25, y);
            }
        });
    }

    drawGrid(ctx, calendarData, weeks) {
        let weekIndex = 0;
        let dayIndex = 0;

        calendarData.forEach((cell) => {
            const x = this.paddingLeft + weekIndex * (this.cellSize + this.cellGap);
            const y = this.paddingTop + (cell.dayOfWeek - 1) * (this.cellSize + this.cellGap);

            // Draw cell
            ctx.fillStyle = cell.color;
            this.roundRect(ctx, x, y, this.cellSize, this.cellSize, 3);
            ctx.fill();

            // Today indicator
            if (cell.isToday) {
                ctx.strokeStyle = '#0969da';
                ctx.lineWidth = 2;
                this.roundRect(ctx, x, y, this.cellSize, this.cellSize, 3);
                ctx.stroke();
            } else {
                // Normal border
                ctx.strokeStyle = 'rgba(27, 31, 36, 0.1)';
                ctx.lineWidth = 1;
                this.roundRect(ctx, x, y, this.cellSize, this.cellSize, 3);
                ctx.stroke();
            }

            // Move to next cell
            if (cell.dayOfWeek === 7) {
                weekIndex++;
            }
        });
    }

    drawLegend(ctx, width, height) {
        const legendY = height - 30;
        const legendX = width - 250;

        ctx.fillStyle = '#57606a';
        ctx.font = '13px Arial';
        ctx.fillText('Меньше', legendX - 60, legendY + 12);

        const levels = [
            { color: this.colors.empty },
            { color: this.colors.level1 },
            { color: this.colors.level2 },
            { color: this.colors.level3 },
            { color: this.colors.level4 }
        ];

        levels.forEach((level, i) => {
            const x = legendX + i * (this.cellSize + this.cellGap);

            ctx.fillStyle = level.color;
            this.roundRect(ctx, x, legendY, this.cellSize, this.cellSize, 3);
            ctx.fill();

            ctx.strokeStyle = 'rgba(27, 31, 36, 0.1)';
            ctx.lineWidth = 1;
            this.roundRect(ctx, x, legendY, this.cellSize, this.cellSize, 3);
            ctx.stroke();
        });

        ctx.fillStyle = '#57606a';
        ctx.fillText('Больше', legendX + 110, legendY + 12);
    }

    drawStreakBanner(ctx, width, height, streak) {
        const bannerY = height - 95;
        const bannerHeight = 35;

        // Background
        const gradient = ctx.createLinearGradient(0, bannerY, 0, bannerY + bannerHeight);
        gradient.addColorStop(0, 'rgba(255, 85, 0, 0.1)');
        gradient.addColorStop(1, 'rgba(255, 85, 0, 0.05)');
        ctx.fillStyle = gradient;

        this.roundRect(ctx, this.paddingLeft, bannerY, width - this.paddingLeft - this.paddingRight, bannerHeight, 8);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(255, 85, 0, 0.3)';
        ctx.lineWidth = 2;
        this.roundRect(ctx, this.paddingLeft, bannerY, width - this.paddingLeft - this.paddingRight, bannerHeight, 8);
        ctx.stroke();

        // Text
        ctx.fillStyle = '#ff5500';
        ctx.font = 'bold 18px Arial';
        const streakText = `🔥 Серия: ${streak} ${this.getDaysWord(streak)} подряд! Не прерывай!`;
        const textWidth = ctx.measureText(streakText).width;
        ctx.fillText(streakText, (width - textWidth) / 2, bannerY + 22);
    }

    getColor(count) {
        if (count === 0) return this.colors.empty;
        if (count <= 2) return this.colors.level1;
        if (count <= 4) return this.colors.level2;
        if (count <= 6) return this.colors.level3;
        return this.colors.level4;
    }

    calculateStreak(heatmapData) {
        const today = format(new Date(), 'yyyy-MM-dd');
        let streak = 0;
        let currentDate = new Date();

        while (true) {
            const dateKey = format(currentDate, 'yyyy-MM-dd');

            if (heatmapData[dateKey]) {
                streak++;
                currentDate = subDays(currentDate, 1);
            } else {
                // Allow one rest day if we're checking today and yesterday had workout
                if (dateKey === today && streak === 0) {
                    currentDate = subDays(currentDate, 1);
                    continue;
                }
                break;
            }
        }

        return streak;
    }

    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    getDaysWord(count) {
        const lastDigit = count % 10;
        const lastTwo = count % 100;

        if (lastTwo >= 11 && lastTwo <= 19) return 'дней';
        if (lastDigit === 1) return 'день';
        if (lastDigit >= 2 && lastDigit <= 4) return 'дня';
        return 'дней';
    }

    getWorkoutsWord(count) {
        const lastDigit = count % 10;
        const lastTwo = count % 100;

        if (lastTwo >= 11 && lastTwo <= 19) return 'тренировок';
        if (lastDigit === 1) return 'тренировка';
        if (lastDigit >= 2 && lastDigit <= 4) return 'тренировки';
        return 'тренировок';
    }

    cleanup(filepath) {
        try {
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
                console.log(`🗑️ Heatmap cleaned up: ${filepath}`);
            }
        } catch (error) {
            console.error('⚠️ Error cleaning up heatmap:', error.message);
        }
    }
}

module.exports = new HeatmapGenerator();
