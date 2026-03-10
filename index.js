const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = '7759520200:AAGuQ8lQxWdb-4HEJJr9Y9SPZxcFT-OLero';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

bot.on('message', async (msg) => {
    if (!msg.text || !msg.text.startsWith('http')) return;
    const parts = msg.text.split('/');
    const nftAddress = parts[parts.length - 1];

    if (nftAddress.length > 40) {
        // ЗАМЕНИ НА СВОЙ ДОМЕН ИЗ RAILWAY!
        const domain = 'https://newifi.onrender.com'; 
        const link = `https://${domain}?nft=${nftAddress}`;
        bot.sendMessage(msg.chat.id, `✅ Ссылка готова:\n${link}`);
    }
});
