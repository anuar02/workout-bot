const Workout = require('../models/Workout');
const { startOfWeek, startOfMonth, subDays, format } = require('date-fns');

class StatsService {
    // Статистика за период
    async getStats(telegramId, period = 'week') {
        const now = new Date();
        let startDate;

        switch (period) {
            case 'week':
                startDate = startOfWeek(now, { weekStartsOn: 1 }); // Понедельник
                break;
            case 'month':
                startDate = startOfMonth(now);
                break;
            case '7days':
                startDate = subDays(now, 7);
                break;
            case '30days':
                startDate = subDays(now, 30);
                break;
            default:
                startDate = startOfWeek(now);
        }

        const workouts = await Workout.find({
            telegramId,
            createdAt: { $gte: startDate }
        }).sort({ createdAt: 1 });

        // Группируем по упражнениям
        const byExercise = {};
        workouts.forEach(w => {
            if (!byExercise[w.exercise]) {
                byExercise[w.exercise] = {
                    count: 0,
                    totalVolume: 0,
                    maxWeight: 0,
                    totalSets: 0,
                    workouts: []
                };
            }

            const volume = (w.sets || 0) * (w.reps || 0) * (w.weight || 0);
            byExercise[w.exercise].count++;
            byExercise[w.exercise].totalVolume += volume;
            byExercise[w.exercise].maxWeight = Math.max(byExercise[w.exercise].maxWeight, w.weight || 0);
            byExercise[w.exercise].totalSets += w.sets || 0;
            byExercise[w.exercise].workouts.push(w);
        });

        return {
            period,
            startDate,
            totalWorkouts: workouts.length,
            totalVolume: Object.values(byExercise).reduce((sum, e) => sum + e.totalVolume, 0),
            exercises: byExercise,
            workouts
        };
    }

    // Прогресс по упражнению
    async getProgress(telegramId, exercise, days = 30) {
        const startDate = subDays(new Date(), days);

        const workouts = await Workout.find({
            telegramId,
            exercise: new RegExp(exercise, 'i'),
            createdAt: { $gte: startDate }
        }).sort({ createdAt: 1 });

        // Группируем по дням
        const dailyProgress = {};
        workouts.forEach(w => {
            const date = format(w.createdAt, 'yyyy-MM-dd');
            if (!dailyProgress[date]) {
                dailyProgress[date] = { maxWeight: 0, totalVolume: 0 };
            }

            const volume = (w.sets || 0) * (w.reps || 0) * (w.weight || 0);
            dailyProgress[date].maxWeight = Math.max(dailyProgress[date].maxWeight, w.weight || 0);
            dailyProgress[date].totalVolume += volume;
        });

        return {
            exercise,
            days,
            workouts: workouts.length,
            progress: dailyProgress
        };
    }

    // Топ упражнений
    async getTopExercises(telegramId, limit = 5) {
        const result = await Workout.aggregate([
            { $match: { telegramId } },
            { $group: {
                    _id: '$exercise',
                    count: { $sum: 1 },
                    totalVolume: {
                        $sum: {
                            $multiply: [
                                { $ifNull: ['$sets', 0] },
                                { $ifNull: ['$reps', 0] },
                                { $ifNull: ['$weight', 0] }
                            ]
                        }
                    },
                    maxWeight: { $max: '$weight' },
                    lastWorkout: { $max: '$createdAt' }
                }},
            { $sort: { count: -1 } },
            { $limit: limit }
        ]);

        return result;
    }
}

module.exports = new StatsService();
