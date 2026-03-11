const express = require('express');
const { Telegraf } = require('telegraf');
const cheerio = require('cheerio');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Обработчики фатальных ошибок (чтобы видеть причину падения)
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
});

// ========== Конфигурация ==========
const BOT_TOKEN = '7759520200:AAGuQ8lQxWdb-4HEJJr9Y9SPZxcFT-OLero';
const ADMIN_ID = 1471307057;
const DATA_FILE = path.join(__dirname, 'users.json');
const BASE_URL = process.env.RENDER_EXTERNAL_URL || 'https://newifi.onrender.com';
// ==================================

const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, './'))); // отдаём index.html

// ========== Работа с JSON базой ==========
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE);
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('Ошибка загрузки данных:', e);
    }
    return { users: [] };
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Ошибка сохранения данных:', e);
    }
}

function findUser(telegramId, username) {
    const data = loadData();
    let user = data.users.find(u => u.telegramId === telegramId);
    if (!user && username) {
        user = data.users.find(u => u.username === username);
    }
    return { data, user };
}
// ==========================================

// ========== Парсинг NFT с getgems.io ==========
async function parseNFT(url) {
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = await response.text();
        const $ = cheerio.load(html);
        
        const title = $('meta[property="og:title"]').attr('content') || 'NFT';
        const image = $('meta[property="og:image"]').attr('content') || '';
        const description = $('meta[property="og:description"]').attr('content') || '';
        const nftId = url.split('/').pop() || Date.now().toString();
        
        return {
            nftId,
            title,
            description,
            imageUrl: image,
            externalUrl: url,
            status: 'inventory'
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
bot.start((ctx) => {
    ctx.reply('🎁 Твой инвентарь NFT. Нажимай кнопку, чтобы открыть:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📦 Открыть инвентарь', web_app: { url: `${BASE_URL}/app` } }]
            ]
        }
    });
});

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

    const nftData = await parseNFT(nftUrl);
    const { data, user } = findUser(null, username);
    if (user) {
        user.nfts.push(nftData);
        saveData(data);
        ctx.reply(`✅ NFT добавлен пользователю @${username}`);
    } else {
        data.users.push({
            telegramId: null,
            username,
            nfts: [nftData]
        });
        saveData(data);
        ctx.reply(`✅ NFT добавлен пользователю @${username} (ID пока неизвестен, привяжется при первом входе)`);
    }
});

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

// ========== Верификация initData (упрощённая) ==========
function verifyTelegramData(initData) {
    const params = new URLSearchParams(initData);
    const userStr = params.get('user');
    if (userStr) {
        try {
            return JSON.parse(userStr);
        } catch (e) {}
    }
    return null;
}
// =======================================================

// ========== API для Mini App ==========
app.post('/api/user', (req, res) => {
    const { initData } = req.body;
    const userData = verifyTelegramData(initData);
    if (!userData) {
        return res.status(401).json({ error: 'Invalid initData' });
    }
    const telegramId = userData.id;
    const username = userData.username || `user${telegramId}`;

    const { data, user } = findUser(telegramId, username);
    
    if (user && !user.telegramId) {
        user.telegramId = telegramId;
        saveData(data);
    }
    
    if (!user) {
        data.users.push({
            telegramId,
            username,
            nfts: []
        });
        saveData(data);
    }
    
    const currentUser = data.users.find(u => u.telegramId === telegramId);
    res.json({ nfts: currentUser ? currentUser.nfts.filter(n => n.status === 'inventory') : [] });
});

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
