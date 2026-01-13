const path = require('path');

function formatWorkoutConfirmation(parsed, user, xpResult, characterInfo) {
    const volume = (parsed.sets || 1) * (parsed.reps || 0) * (parsed.weight || 0);
    const dateLabel = parsed.workoutDate ? 
        new Date(parsed.workoutDate).toLocaleDateString('ru-RU') : 'сегодня';

    let setsRepsText = '';
    if (parsed.sets && parsed.reps) {
        setsRepsText = `${parsed.sets} подходов × ${parsed.reps} повторений`;
    } else if (parsed.reps && !parsed.sets) {
        setsRepsText = `${parsed.reps} повторений (1 подход)`;
    } else if (parsed.sets && !parsed.reps) {
        setsRepsText = `${parsed.sets} подходов`;
    } else {
        setsRepsText = 'не указано';
    }

    let message = `✅ *Записал!*\n\n` +
        `📅 Дата: ${dateLabel}\n` +
        `📋 Упражнение: ${parsed.exercise}\n` +
        `📝 Описание: ${setsRepsText}`;
    
    if (parsed.weight) {
        message += `\n⚖️ Вес: ${parsed.weight} кг`;
    }
    
    message += `\n💪 Объём: ${volume > 0 ? volume.toLocaleString() + ' кг' : '-'}\n`;
    
    if (parsed.feeling) {
        message += `😊 Самочувствие: ${parsed.feeling}\n`;
    }
    
    if (parsed.notes) {
        message += `📝 Заметка: ${parsed.notes}\n`;
    }
    
    message += `\n📊 Всего тренировок: ${user.stats.totalWorkouts}`;

    return message;
}

function formatWorkoutWithCharacter(parsed, user, xpResult, characterInfo, limitCheck) {
    const volume = (parsed.sets || 0) * (parsed.reps || 0) * (parsed.weight || 0);

    // Determine image level (0-9)
    const imageLevel = Math.min(9, Math.floor(characterInfo.level / 2));
    const imagePath = path.join(__dirname, '..', 'assets', 'characters',
        `${user.gamification.character.type}_level_${imageLevel}.png`);

    // Progress bar
    const xpBar = '█'.repeat(Math.floor(characterInfo.progress / 10)) +
        '░'.repeat(10 - Math.floor(characterInfo.progress / 10));

    let caption = `✅ *Записано! +${xpResult.xpAdded} XP*\n\n`;

    // Level up?
    if (xpResult.leveledUp) {
        caption = `🎊 *LEVEL UP!* 🎊\n\n` +
            `${characterInfo.emoji} ${characterInfo.name} достиг ${characterInfo.level} уровня!\n\n`;
    }

    // Evolution?
    if (xpResult.evolved) {
        caption = `✨ *ЭВОЛЮЦИЯ!* ✨\n\n` +
            `${characterInfo.emoji} ${characterInfo.name} эволюционировал в ${characterInfo.evolutionName}!\n\n`;
    }

    caption += `${characterInfo.emoji} *${characterInfo.name}* - Lvl ${characterInfo.level}\n`;
    caption += `${xpBar} ${characterInfo.xp}/${characterInfo.nextLevelXP}\n\n`;
    caption += `📋 ${parsed.exercise}\n`;
    caption += `📝 ${parsed.sets || '-'} × ${parsed.reps || '-'}`;
    if (parsed.weight) caption += ` × ${parsed.weight}кг`;
    caption += `\n💪 Объём: ${volume > 0 ? volume.toLocaleString() + ' кг' : '-'}\n\n`;
    caption += `🔥 Серия: ${user.stats.currentStreak} дней\n`;
    caption += `📊 Тренировок: ${user.stats.totalWorkouts}`;

    if (limitCheck.remaining !== undefined) {
        caption += `\n\n⚠️ Осталось ${limitCheck.remaining} бесплатных голосовых`;
    }

    return { caption, imagePath };
}

function formatProgressBar(current, max) {
    const progress = Math.floor((current / max) * 10);
    return '█'.repeat(progress) + '░'.repeat(10 - progress);
}

function getPeriodName(period) {
    const names = {
        'week': 'неделю',
        'month': 'месяц',
        '7days': '7 дней',
        '30days': '30 дней'
    };
    return names[period] || period;
}

module.exports = {
    formatWorkoutConfirmation,
    formatWorkoutWithCharacter,
    formatProgressBar,
    getPeriodName
};
