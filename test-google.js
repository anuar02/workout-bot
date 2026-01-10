require('dotenv').config();
const { google } = require('googleapis');

async function testGoogleAPIs() {
    console.log('🧪 Тестирую Google APIs...\n');

    const auth = new google.auth.GoogleAuth({
        keyFile: 'google-credentials.json',
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.file'
        ],
    });

    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    try {
        // Тест 1: Создать файл через Drive
        console.log('📝 Тест 1: Создание файла через Drive API...');
        const file = await drive.files.create({
            resource: {
                name: 'TEST - Delete Me',
                mimeType: 'application/vnd.google-apps.spreadsheet'
            },
            fields: 'id, name, webViewLink'
        });

        console.log('✅ Файл создан!');
        console.log(`   ID: ${file.data.id}`);
        console.log(`   Ссылка: ${file.data.webViewLink}\n`);

        // Тест 2: Записать данные через Sheets
        console.log('📊 Тест 2: Запись данных через Sheets API...');
        await sheets.spreadsheets.values.update({
            spreadsheetId: file.data.id,
            range: 'Sheet1!A1:B2',
            valueInputOption: 'RAW',
            resource: {
                values: [
                    ['Тест', 'Успешно'],
                    ['Дата', new Date().toLocaleString('ru-RU')]
                ]
            }
        });

        console.log('✅ Данные записаны!\n');

        // Тест 3: Удалить тестовый файл
        console.log('🗑️  Тест 3: Удаление тестового файла...');
        await drive.files.delete({
            fileId: file.data.id
        });

        console.log('✅ Файл удалён!\n');

        console.log('🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ! Google APIs работают корректно.\n');

    } catch (error) {
        console.error('❌ ОШИБКА:', error.message);

        if (error.code === 403) {
            console.error('\n⚠️  ПРОБЛЕМА С ДОСТУПОМ:');
            console.error('1. Убедись что включен Google Drive API');
            console.error('2. Подожди 1-2 минуты после включения');
            console.error('3. Проверь что Service Account имеет роль Editor\n');
        }

        if (error.code === 404) {
            console.error('\n⚠️  API НЕ НАЙДЕН:');
            console.error('Включи Google Drive API в Cloud Console\n');
        }
    }
}

testGoogleAPIs();
