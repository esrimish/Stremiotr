const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
// Statik dosyaları (logo.png gibi) dışarı açar
app.use(express.static(__dirname));

// --- 1. ANA SAYFA (TELEFON KISAYOLU İÇİN) ---
app.get('/', (req, res) => {
    const host = req.get('host');
    res.send(`
        <html>
            <head>
                <title>Stremio Altyazi</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <link rel="apple-touch-icon" href="https://${host}/logo.png">
                <link rel="icon" type="image/png" href="https://${host}/logo.png">
                <meta name="theme-color" content="#111111">
                <style>
                    body { font-family: sans-serif; text-align: center; padding: 50px; background: #111; color: white; }
                    img { width: 120px; border-radius: 20px; margin-bottom: 20px; border: 2px solid #333; }
                    .status { color: #00ff00; font-weight: bold; }
                </style>
            </head>
            <body>
                <img src="/logo.png" alt="Logo">
                <h1>Altyazi Servisi <span class="status">AKTIF</span></h1>
                <p>TV bağlantısı hazır. Sunucu uyanık.</p>
            </body>
        </html>
    `);
});

// --- 2. STREMIO MANIFEST ---
app.get('/manifest.json', (req, res) => {
    res.json({
        id: "com.render.altyazi",
        version: "1.0.1",
        name: "Render Altyazi Servisi",
        description: "HTTPS Destekli Kişisel Altyazi",
        logo: `https://${req.get('host')}/logo.png`,
        resources: ["subtitles"],
        types: ["movie", "series"],
        idPrefixes: ["tt"]
    });
});

// --- 3. ALTYAZI LİSTELEME ---
app.get('/subtitles/:type/:id/:extra.json', (req, res) => {
    const imdbId = req.params.id.split(':')[0];
    res.json({
        subtitles: [{
            id: "local-sub",
            url: `https://${req.get('host')}/download/${imdbId}.srt`,
            lang: "Turkish"
        }]
    });
});

// --- 4. ALTYAZI İNDİRME ---
app.get('/download/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'subs', req.params.filename);
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
        res.download(filePath);
    } else {
        res.status(404).send("Altyazi bulunamadi.");
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
