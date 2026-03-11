const express = require('express');
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// ========== Конфигурация ==========
const BOT_TOKEN = '7759520200:AAGuQ8lQxWdb-4HEJJr9Y9SPZxcFT-OLero';
const ADMIN_ID = 1471307057;  // твой Telegram ID
const DATA_FILE = path.join(__dirname, 'users.json');
// ==================================

// Инициализация бота и приложения
const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, './'))); // для отдачи index.html

// ========== Работа с данными (JSON) ==========
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE);
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('Ошибка загрузки данных:', e);
    }
    return { users: [] };  // структура: { users: [ { telegramId, username, nfts: [...] } ] }
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Ошибка сохранения данных:', e);
    }
}

// Найти пользователя по telegramId или username
function findUser(telegramId, username) {
    const data = loadData();
    let user = data.users.find(u => u.telegramId === telegramId);
    if (!user && username) {
        user = data.users.find(u => u.username === username);
    }
    return { data, user };
}

// Создать или обновить пользователя
function updateUser(telegramId, username, nft) {
    const { data, user } = findUser(telegramId, username);
    if (user) {
        user.nfts.push(nft);
    } else {
        data.users.push({
            telegramId,
            username,
            nfts: [nft]
        });
    }
    saveData(data);
}
// =============================================

// ========== Парсинг NFT с getgems.io ==========
async function parseNFT(url) {
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = await response.text();
        const $ = cheerio.load(html);
        
        // Пробуем вытащить мета-теги
        const title = $('meta[property="og:title"]').attr('content') || 'NFT';
        const image = $('meta[property="og:image"]').attr('content') || '';
        const description = $('meta[property="og:description"]').attr('content') || '';
        
        // Если не нашли, пробуем другие селекторы (для getgems)
        const nftId = url.split('/').pop() || Date.now().toString();
        
        return {
            nftId,
            title,
            description,
            imageUrl: image,
            externalUrl: url,
            status: 'inventory'  // inventory, sent, blocked
        };
    } catch (e) {
        console.error('Ошибка парсинга NFT:', e);
        return {
            nftId: 'error_' + Date.now(),
            title: 'Ошибка загрузки',
            description: 'Не удалось загрузить данные',
            imageUrl: '',
            externalUrl: url,
            status: 'inventory'
        };
    }
}
// ===============================================

// ========== Команды бота ==========
// Старт – отправляет кнопку с Mini App
bot.start((ctx) => {
    ctx.reply('🎁 Твой инвентарь NFT. Нажимай кнопку, чтобы открыть:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📦 Открыть инвентарь', web_app: { url: 'https://newifi.onrender.com/' + process.env.RENDER_EXTERNAL_URL || 'твой-сайт.com' + '/app' } }]
            ]
        }
    });
});

// Админская команда /addnft @username ссылка
bot.command('addnft', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('Ты не админ.');
    }
    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply('Использование: /addnft @username ссылка');
    }
    const username = args[1].replace('@', '');
    const nftUrl = args[2];

    // Парсим NFT
    const nftData = await parseNFT(nftUrl);
    
    // Сохраняем пользователю
    // Временно telegramId не знаем, найдём по username при первом заходе в Mini App
    const { data, user } = findUser(null, username);
    if (user) {
        user.nfts.push(nftData);
        saveData(data);
        ctx.reply(`✅ NFT добавлен пользователю @${username}`);
    } else {
        // Создаём запись без telegramId, позже привяжется
        data.users.push({
            telegramId: null,
            username,
            nfts: [nftData]
        });
        saveData(data);
        ctx.reply(`✅ NFT добавлен пользователю @${username} (ID пока неизвестен, привяжется при первом входе)`);
    }
});

// Команда для просмотра всех пользователей (админ)
bot.command('users', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const data = loadData();
    let msg = '👥 Пользователи:\n';
    data.users.forEach(u => {
        msg += `@${u.username || '?'} (ID: ${u.telegramId || 'неизвестен'}) - ${u.nfts.length} NFT\n`;
    });
    ctx.reply(msg);
});

bot.launch();
console.log('Бот запущен');
// ==================================

// ========== API для Mini App ==========
// Верификация initData (упрощённая)
function verifyTelegramData(initData) {
    // В реальности нужно проверять подпись с токеном бота.
    // Для простоты парсим и извлекаем user
    const params = new URLSearchParams(initData);
    const userStr = params.get('user');
    if (userStr) {
        try {
            return JSON.parse(userStr);
        } catch (e) {}
    }
    return null;
}

// Получить данные пользователя по initData
app.post('/api/user', (req, res) => {
    const { initData } = req.body;
    const userData = verifyTelegramData(initData);
    if (!userData) {
        return res.status(401).json({ error: 'Invalid initData' });
    }
    const telegramId = userData.id;
    const username = userData.username || `user${telegramId}`;

    const { data, user } = findUser(telegramId, username);
    
    // Если пользователь найден по username, но без telegramId, обновляем telegramId
    if (user && !user.telegramId) {
        user.telegramId = telegramId;
        saveData(data);
    }
    
    // Если пользователя нет вообще – создаём
    if (!user) {
        data.users.push({
            telegramId,
            username,
            nfts: []
        });
        saveData(data);
    }
    
    // Возвращаем NFT со статусом inventory (отдаём только те, что в инвентаре)
    const currentUser = data.users.find(u => u.telegramId === telegramId);
    res.json({ nfts: currentUser ? currentUser.nfts.filter(n => n.status === 'inventory') : [] });
});

// Отправка NFT (смена статуса на sent)
app.post('/api/send', (req, res) => {
    const { nftId, initData } = req.body;
    const userData = verifyTelegramData(initData);
    if (!userData) return res.status(401).json({ error: 'Invalid initData' });
    
    const telegramId = userData.id;
    const { data, user } = findUser(telegramId, null);
    if (!user) return res.json({ success: false, error: 'User not found' });
    
    const nft = user.nfts.find(n => n.nftId === nftId);
    if (nft && nft.status === 'inventory') {
        nft.status = 'sent';
        saveData(data);
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'NFT not found or already sent' });
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
