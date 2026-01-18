// ===== routes/miniapp.js =====
// Add these routes to your bot backend

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Workout = require('../models/Workout');
const { verifyTelegramWebAppData } = require('../middlewares/telegramAuth');

// Middleware to verify Telegram Mini App auth
router.use(verifyTelegramWebAppData);

// GET /api/user - Get user data
router.get('/user', async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.user.id });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: user.telegramId,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/user/stats - Get user stats
router.get('/user/stats', async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.user.id });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            totalWorkouts: user.stats.totalWorkouts,
            monthlyWorkouts: user.stats.monthlyWorkouts,
            currentStreak: user.stats.currentStreak,
            longestStreak: user.stats.longestStreak,
            lastWorkoutDate: user.stats.lastWorkoutDate
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/workouts - Get workouts
router.get('/workouts', async (req, res) => {
    try {
        const { days = 90, limit = 100 } = req.query;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        const workouts = await Workout.find({
            telegramId: req.user.id,
            createdAt: { $gte: startDate }
        })
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .lean();

        res.json(workouts);
    } catch (error) {
        console.error('Error fetching workouts:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/workouts - Create workout
router.post('/workouts', async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.user.id });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { exercise, sets, reps, weight } = req.body;

        if (!exercise) {
            return res.status(400).json({ error: 'Exercise is required' });
        }

        const workout = new Workout({
            userId: user._id,
            telegramId: user.telegramId,
            exercise,
            sets: sets || null,
            reps: reps || null,
            weight: weight || null,
            workoutDate: new Date()
        });

        await workout.save();

        // Update user stats
        user.stats.totalWorkouts += 1;
        user.stats.monthlyWorkouts += 1;
        user.stats.lastWorkoutDate = new Date();
        await user.save();

        res.status(201).json(workout);
    } catch (error) {
        console.error('Error creating workout:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/character - Get character data
router.get('/character', async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.user.id });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const gamificationService = require('../services/gamification');
        const characterInfo = gamificationService.getCharacterInfo(user);

        res.json(characterInfo);
    } catch (error) {
        console.error('Error fetching character:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/achievements - Get achievements
router.get('/achievements', async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.user.id });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            achievements: user.gamification.achievements,
            badges: user.gamification.badges
        });
    } catch (error) {
        console.error('Error fetching achievements:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
