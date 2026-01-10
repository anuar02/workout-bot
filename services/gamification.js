const User = require('../models/User');

// Персонажи
const CHARACTERS = {
    cat: {
        id: 'cat',
        name: 'Барсик',
        emoji: '🐱',
        description: 'Ловкий котик для новичков',
        targetAudience: 'newbie',
        evolutionNames: ['Котёнок', 'Кот', 'Пантера', 'Царь-Кот']
    },
    dog: {
        id: 'dog',
        name: 'Рекс',
        emoji: '🐶',
        description: 'Сильный пёс для универсалов',
        targetAudience: 'intermediate',
        evolutionNames: ['Щенок', 'Пёс', 'Волк', 'Альфа']
    },
    lion: {
        id: 'lion',
        name: 'Лев',
        emoji: '🦁',
        description: 'Царь зала для опытных',
        targetAudience: 'advanced',
        evolutionNames: ['Львёнок', 'Лев', 'Король', 'Император']
    },
    gorilla: {
        id: 'gorilla',
        name: 'Конг',
        emoji: '🦍',
        description: 'Мощная горилла для пауэрлифтеров',
        targetAudience: 'powerlifter',
        evolutionNames: ['Детёныш', 'Горилла', 'Вожак', 'Титан']
    }
};

// Достижения
const ACHIEVEMENTS = {
    // Базовые (free)
    first_workout: {
        id: 'first_workout',
        name: '🎯 Первый шаг',
        description: 'Записал первую тренировку',
        xpReward: 50,
        tier: 'free',
        checkCondition: (user) => user.stats.totalWorkouts >= 1
    },

    week_streak: {
        id: 'week_streak',
        name: '🔥 Неделя силы',
        description: '7 дней подряд тренировок',
        xpReward: 200,
        tier: 'free',
        checkCondition: (user) => user.stats.currentStreak >= 7
    },

    workouts_10: {
        id: 'workouts_10',
        name: '💪 Вход в ритм',
        description: '10 тренировок записано',
        xpReward: 100,
        tier: 'free',
        checkCondition: (user) => user.stats.totalWorkouts >= 10
    },

    // Basic
    month_streak: {
        id: 'month_streak',
        name: '⚡ Месяц мощи',
        description: '30 дней подряд',
        xpReward: 500,
        tier: 'basic',
        checkCondition: (user) => user.stats.currentStreak >= 30
    },

    workouts_50: {
        id: 'workouts_50',
        name: '🏋️ Атлет',
        description: '50 тренировок',
        xpReward: 300,
        tier: 'basic',
        checkCondition: (user) => user.stats.totalWorkouts >= 50
    },

    level_10: {
        id: 'level_10',
        name: '⭐ Десятка',
        description: 'Персонаж достиг 10 уровня',
        xpReward: 200,
        tier: 'basic',
        checkCondition: (user) => user.gamification.character.level >= 10
    },

    // Premium
    workouts_100: {
        id: 'workouts_100',
        name: '🏆 Центурион',
        description: '100 тренировок',
        xpReward: 1000,
        tier: 'premium',
        checkCondition: (user) => user.stats.totalWorkouts >= 100
    },

    level_20: {
        id: 'level_20',
        name: '👑 Мастер',
        description: 'Персонаж достиг 20 уровня',
        xpReward: 500,
        tier: 'premium',
        checkCondition: (user) => user.gamification.character.level >= 20
    },

    three_month_streak: {
        id: 'three_month_streak',
        name: '🔥 Железная воля',
        description: '90 дней подряд',
        xpReward: 2000,
        tier: 'premium',
        badge: 'Unstoppable',
        checkCondition: (user) => user.stats.currentStreak >= 90
    }
};

class GamificationService {

    // Выбор персонажа при онбординге
    async selectCharacter(telegramId, characterType) {
        const user = await User.findOne({ telegramId });

        if (!user) {
            throw new Error('Пользователь не найден');
        }

        const character = CHARACTERS[characterType];

        if (!character) {
            throw new Error('Неизвестный персонаж');
        }

        user.gamification.character.type = characterType;
        user.gamification.character.name = character.name;
        user.gamification.character.level = 1;
        user.gamification.character.xp = 0;
        user.gamification.character.nextLevelXP = 100;
        user.gamification.character.evolutionStage = 0;

        user.onboarding.characterSelected = true;

        await user.save();

        console.log(`✅ Персонаж выбран: ${user.username} → ${character.name}`);

        return {
            character: character.name,
            emoji: character.emoji,
            evolutionName: character.evolutionNames[0]
        };
    }

    // Начислить XP за тренировку
    async awardWorkoutXP(telegramId, workout) {
        const user = await User.findOne({ telegramId });

        if (!user) return null;

        // Базовый XP
        let baseXP = 50;

        // Бонус за вес
        if (workout.weight) {
            baseXP += Math.floor(workout.weight * 0.1);
        }

        // Бонус за объём
        const volume = (workout.sets || 1) * (workout.reps || 1) * (workout.weight || 0);
        if (volume > 0) {
            baseXP += Math.floor(volume * 0.01);
        }

        // Бонус за серию дней
        if (user.stats.currentStreak >= 7) {
            baseXP = Math.floor(baseXP * 1.5);
        }

        // Добавляем XP (метод в модели учитывает multiplier подписки)
        const result = user.addXP(baseXP);

        await user.save();

        console.log(`💫 XP начислено: ${user.username} +${result.xpAdded} (lvl ${result.leveledUp})`);

        // Проверяем достижения
        await this.checkAchievements(user);

        return {
            xpAdded: result.xpAdded,
            currentLevel: user.gamification.character.level,
            currentXP: user.gamification.character.xp,
            nextLevelXP: user.gamification.character.nextLevelXP,
            leveledUp: result.leveledUp > (result.leveledUp - 1),
            evolved: result.evolved > user.gamification.character.evolutionStage,
            evolutionStage: user.gamification.character.evolutionStage
        };
    }

    // Проверка и разблокировка достижений
    async checkAchievements(user) {
        const newAchievements = [];

        // Получаем эффективный tier (с учётом trial)
        const subscriptionService = require('./subscription');
        const effectiveTier = subscriptionService.getEffectiveTier(user);

        const tierHierarchy = { free: 1, basic: 2, premium: 3, pro: 4 };
        const userTierLevel = tierHierarchy[effectiveTier];

        // Получаем уже разблокированные
        const unlockedIds = user.gamification.achievements.map(a => a.id);

        // Проверяем каждое достижение
        for (const [id, achievement] of Object.entries(ACHIEVEMENTS)) {
            // Уже разблокировано
            if (unlockedIds.includes(id)) continue;

            // Проверяем доступность по tier
            const achievementTierLevel = tierHierarchy[achievement.tier];
            if (achievementTierLevel > userTierLevel) continue;

            // Проверяем условие
            if (achievement.checkCondition(user)) {
                user.gamification.achievements.push({
                    id,
                    name: achievement.name,
                    unlockedAt: new Date()
                });

                // Начисляем XP за достижение
                user.gamification.character.xp += achievement.xpReward;

                // Добавляем бейдж если есть
                if (achievement.badge) {
                    user.gamification.badges.push({
                        id: achievement.badge.toLowerCase(),
                        name: achievement.badge,
                        description: achievement.description,
                        earnedAt: new Date()
                    });
                }

                newAchievements.push({
                    ...achievement,
                    id
                });

                console.log(`🏆 Достижение: ${user.username} → ${achievement.name}`);
            }
        }

        if (newAchievements.length > 0) {
            await user.save();
        }

        return newAchievements;
    }

    // Получить информацию о персонаже
    getCharacterInfo(user) {
        const characterType = user.gamification.character.type;

        if (!characterType) return null;

        const character = CHARACTERS[characterType];
        const evolutionStage = user.gamification.character.evolutionStage;

        return {
            name: user.gamification.character.name,
            emoji: character.emoji,
            level: user.gamification.character.level,
            xp: user.gamification.character.xp,
            nextLevelXP: user.gamification.character.nextLevelXP,
            evolutionName: character.evolutionNames[evolutionStage] || character.evolutionNames[0],
            progress: Math.floor((user.gamification.character.xp / user.gamification.character.nextLevelXP) * 100)
        };
    }

    // Получить все персонажи для выбора
    getAllCharacters() {
        return CHARACTERS;
    }

    // Получить список достижений
    getAllAchievements(tier = 'free') {
        const tierHierarchy = { free: 1, basic: 2, premium: 3, pro: 4 };
        const userTierLevel = tierHierarchy[tier];

        return Object.entries(ACHIEVEMENTS)
            .filter(([_, achievement]) => tierHierarchy[achievement.tier] <= userTierLevel)
            .map(([id, achievement]) => ({ ...achievement, id }));
    }

    // Обновить серию дней
    async updateStreak(telegramId) {
        const user = await User.findOne({ telegramId });

        if (!user) return;

        const now = new Date();
        const lastWorkout = user.stats.lastWorkoutDate;

        if (!lastWorkout) {
            // Первая тренировка
            user.stats.currentStreak = 1;
            user.stats.longestStreak = 1;
        } else {
            const daysSinceLastWorkout = Math.floor((now - lastWorkout) / (1000 * 60 * 60 * 24));

            if (daysSinceLastWorkout === 0) {
                // Сегодня уже была тренировка - не меняем
                return;
            } else if (daysSinceLastWorkout === 1) {
                // Вчера была тренировка - продолжаем серию
                user.stats.currentStreak += 1;

                if (user.stats.currentStreak > user.stats.longestStreak) {
                    user.stats.longestStreak = user.stats.currentStreak;
                }
            } else {
                // Пропустили день - серия сбрасывается
                user.stats.currentStreak = 1;
            }
        }

        user.stats.lastWorkoutDate = now;
        await user.save();

        console.log(`🔥 Серия обновлена: ${user.username} - ${user.stats.currentStreak} дней`);

        return user.stats.currentStreak;
    }
}

module.exports = new GamificationService();
