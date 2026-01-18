const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');

class CharacterShowcaseGenerator {
    constructor() {
        this.width = 1200;
        this.height = 800;
        
        // Ensure output directory exists
        this.outputDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    async generateShowcase() {
        const canvas = createCanvas(this.width, this.height);
        const ctx = canvas.getContext('2d');

        // Background gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.width, this.height);

        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('ВЫБЕРИ СВОЕГО КОМПАНЬОНА', this.width / 2, 80);

        // Characters data
        const characters = [
            {
                emoji: '🐱',
                name: 'БАРСИК',
                subtitle: 'Fast Learner',
                color: '#ff6b6b',
                description: 'Для новичков\nБыстрый рост'
            },
            {
                emoji: '🐶',
                name: 'РЕКС',
                subtitle: 'Balanced',
                color: '#4ecdc4',
                description: 'Универсал\nСтабильный прогресс'
            },
            {
                emoji: '🦁',
                name: 'ЛЕВ',
                subtitle: 'Elite',
                color: '#ffe66d',
                description: 'Для опытных\nМаксимум силы'
            },
            {
                emoji: '🦍',
                name: 'КОНГ',
                subtitle: 'Maximum Power',
                color: '#a8dadc',
                description: 'Пауэрлифтеры\nМощь титана'
            }
        ];

        const cardWidth = 250;
        const cardHeight = 400;
        const spacing = 40;
        const startX = (this.width - (cardWidth * 4 + spacing * 3)) / 2;
        const startY = 180;

        // Draw character cards
        characters.forEach((char, index) => {
            const x = startX + (cardWidth + spacing) * index;
            const y = startY;

            // Card background
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            this.roundRect(ctx, x, y, cardWidth, cardHeight, 20);
            ctx.fill();

            // Border
            ctx.strokeStyle = char.color;
            ctx.lineWidth = 3;
            this.roundRect(ctx, x, y, cardWidth, cardHeight, 20);
            ctx.stroke();

            // Emoji (large)
            ctx.font = '80px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(char.emoji, x + cardWidth / 2, y + 120);

            // Name
            ctx.font = 'bold 28px Arial';
            ctx.fillStyle = char.color;
            ctx.fillText(char.name, x + cardWidth / 2, y + 180);

            // Subtitle
            ctx.font = '18px Arial';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(char.subtitle, x + cardWidth / 2, y + 210);

            // Description
            ctx.font = '16px Arial';
            ctx.fillStyle = '#cccccc';
            const lines = char.description.split('\n');
            lines.forEach((line, i) => {
                ctx.fillText(line, x + cardWidth / 2, y + 260 + i * 25);
            });

            // Level indicator
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            this.roundRect(ctx, x + 20, y + 330, cardWidth - 40, 40, 10);
            ctx.fill();

            ctx.font = 'bold 16px Arial';
            ctx.fillStyle = char.color;
            ctx.fillText('Старт: LVL 1', x + cardWidth / 2, y + 355);
        });

        // Bottom text
        ctx.font = 'italic 20px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText('Твой персонаж будет расти вместе с тобой! 💪', this.width / 2, this.height - 80);

        // Save image
        const buffer = canvas.toBuffer('image/png');
        const filename = path.join(this.outputDir, 'character_showcase.png');
        fs.writeFileSync(filename, buffer);

        console.log(`✅ Character showcase generated: ${filename}`);
        return filename;
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
}

module.exports = new CharacterShowcaseGenerator();
