const ExcelJS = require('exceljs');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const fs = require('fs');
const Workout = require('../models/Workout');

class ExportService {
    constructor() {
        this.tempDir = path.join(__dirname, '../temp');
        // Создаём папку для временных файлов
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    // Экспорт в Excel
    async exportToExcel(telegramId, username) {
        try {
            const workouts = await Workout.find({ telegramId })
                .sort({ createdAt: -1 })
                .lean();

            if (workouts.length === 0) {
                throw new Error('Нет данных для экспорта');
            }

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Тренировки');

            // Настройка колонок
            worksheet.columns = [
                { header: 'Дата', key: 'date', width: 12 },
                { header: 'Время', key: 'time', width: 10 },
                { header: 'Упражнение', key: 'exercise', width: 25 },
                { header: 'Подходы', key: 'sets', width: 10 },
                { header: 'Вес (кг)', key: 'weight', width: 10 },
                { header: 'Повторения', key: 'reps', width: 12 },
                { header: 'Объём', key: 'volume', width: 12 }
            ];

            // Стиль заголовка
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            };

            // Добавляем данные
            workouts.forEach(workout => {
                const date = new Date(workout.createdAt);
                const volume = (workout.sets || 0) * (workout.reps || 0) * (workout.weight || 0);

                worksheet.addRow({
                    date: date.toLocaleDateString('ru-RU'),
                    time: date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                    exercise: workout.exercise,
                    sets: workout.sets || '-',
                    weight: workout.weight || '-',
                    reps: workout.reps || '-',
                    volume: volume > 0 ? volume : '-'
                });
            });

            // Добавляем статистику внизу
            const lastRow = worksheet.lastRow.number + 2;
            worksheet.getCell(`A${lastRow}`).value = 'Всего тренировок:';
            worksheet.getCell(`A${lastRow}`).font = { bold: true };
            worksheet.getCell(`B${lastRow}`).value = workouts.length;

            // Общий объём
            const totalVolume = workouts.reduce((sum, w) => {
                return sum + ((w.sets || 0) * (w.reps || 0) * (w.weight || 0));
            }, 0);

            worksheet.getCell(`A${lastRow + 1}`).value = 'Общий объём (кг):';
            worksheet.getCell(`A${lastRow + 1}`).font = { bold: true };
            worksheet.getCell(`B${lastRow + 1}`).value = totalVolume.toLocaleString();

            // Сохраняем файл
            const filename = `workouts_${username}_${Date.now()}.xlsx`;
            const filepath = path.join(this.tempDir, filename);

            await workbook.xlsx.writeFile(filepath);
            console.log(`✅ Excel создан: ${filepath}`);

            return filepath;

        } catch (error) {
            console.error('❌ Ошибка экспорта в Excel:', error);
            throw error;
        }
    }

    // Экспорт в CSV
    async exportToCSV(telegramId, username) {
        try {
            const workouts = await Workout.find({ telegramId })
                .sort({ createdAt: -1 })
                .lean();

            if (workouts.length === 0) {
                throw new Error('Нет данных для экспорта');
            }

            const filename = `workouts_${username}_${Date.now()}.csv`;
            const filepath = path.join(this.tempDir, filename);

            const csvWriter = createObjectCsvWriter({
                path: filepath,
                header: [
                    { id: 'date', title: 'Дата' },
                    { id: 'time', title: 'Время' },
                    { id: 'exercise', title: 'Упражнение' },
                    { id: 'sets', title: 'Подходы' },
                    { id: 'weight', title: 'Вес (кг)' },
                    { id: 'reps', title: 'Повторения' },
                    { id: 'volume', title: 'Объём' }
                ]
            });

            const records = workouts.map(workout => {
                const date = new Date(workout.createdAt);
                const volume = (workout.sets || 0) * (workout.reps || 0) * (workout.weight || 0);

                return {
                    date: date.toLocaleDateString('ru-RU'),
                    time: date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                    exercise: workout.exercise,
                    sets: workout.sets || '-',
                    weight: workout.weight || '-',
                    reps: workout.reps || '-',
                    volume: volume > 0 ? volume : '-'
                };
            });

            await csvWriter.writeRecords(records);
            console.log(`✅ CSV создан: ${filepath}`);

            return filepath;

        } catch (error) {
            console.error('❌ Ошибка экспорта в CSV:', error);
            throw error;
        }
    }

    // Очистка временных файлов
    cleanupFile(filepath) {
        try {
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
                console.log(`🗑️  Удалён временный файл: ${filepath}`);
            }
        } catch (error) {
            console.error('⚠️  Не смог удалить файл:', error.message);
        }
    }

    // Очистка старых файлов (старше 1 часа)
    cleanupOldFiles() {
        try {
            const files = fs.readdirSync(this.tempDir);
            const now = Date.now();
            const oneHour = 60 * 60 * 1000;

            files.forEach(file => {
                const filepath = path.join(this.tempDir, file);
                const stats = fs.statSync(filepath);

                if (now - stats.mtimeMs > oneHour) {
                    fs.unlinkSync(filepath);
                    console.log(`🗑️  Удалён старый файл: ${file}`);
                }
            });
        } catch (error) {
            console.error('⚠️  Ошибка очистки старых файлов:', error.message);
        }
    }
}

module.exports = new ExportService();
