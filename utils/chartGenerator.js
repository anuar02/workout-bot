const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const { format } = require('date-fns');

class ChartGenerator {
    constructor() {
        this.chartJSNodeCanvas = new ChartJSNodeCanvas({
            width: 800,
            height: 600,
            backgroundColour: 'white'
        });
    }

    // График прогресса по весу
    async generateProgressChart(progressData) {
        const dates = Object.keys(progressData.progress).sort();
        const weights = dates.map(d => progressData.progress[d].maxWeight);

        const configuration = {
            type: 'line',
            data: {
                labels: dates.map(d => format(new Date(d), 'dd.MM')),
                datasets: [{
                    label: `${progressData.exercise} - Макс. вес (кг)`,
                    data: weights,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.1,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: `Прогресс: ${progressData.exercise}`,
                        font: { size: 20 }
                    },
                    legend: {
                        display: true
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Вес (кг)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Дата'
                        }
                    }
                }
            }
        };

        return await this.chartJSNodeCanvas.renderToBuffer(configuration);
    }

    // График объёма тренировок
    async generateVolumeChart(statsData) {
        const exercises = Object.keys(statsData.exercises).slice(0, 5);
        const volumes = exercises.map(e => statsData.exercises[e].totalVolume);

        const configuration = {
            type: 'bar',
            data: {
                labels: exercises,
                datasets: [{
                    label: 'Общий объём (кг)',
                    data: volumes,
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.7)',
                        'rgba(54, 162, 235, 0.7)',
                        'rgba(255, 206, 86, 0.7)',
                        'rgba(75, 192, 192, 0.7)',
                        'rgba(153, 102, 255, 0.7)'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: `Объём тренировок (${statsData.period})`,
                        font: { size: 20 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Объём (sets × reps × weight)'
                        }
                    }
                }
            }
        };

        return await this.chartJSNodeCanvas.renderToBuffer(configuration);
    }
}

module.exports = new ChartGenerator();
