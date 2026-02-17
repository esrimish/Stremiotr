const axios = require('axios');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.static(__dirname));

// --- 1. MOBİL UYUMLU ANA SAYFA (YÜKLE BUTONLU) ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Altyazı Servisi</title>
        <link rel="manifest" href="/web-manifest.json">
        <style>
            body { background: #0f0f0f; color: white; font-family: 'Segoe UI', sans-serif; text-align: center; padding: 40px 20px; }
            .card { background: #1a1a1a; padding: 30px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); max-width: 400px; margin: auto; }
            img { width: 100px; border-radius: 20px; margin-bottom: 20px; border: 2px solid #00d1b2; }
            h1 { font-size: 24px; margin-bottom: 10px; color: #00d1b2; }
            p { color: #aaa; font-size: 14px; line-height: 1.6; }
            .btn { background: #00d1b2; color: #fff; border: none; padding: 12px 25px; border-radius: 10px; font-weight: bold; cursor: pointer; margin-top: 20px; width: 100%; transition: 0.3s; }
            .btn:hover { background: #00b89c; }
            code { display: block; background: #000; padding: 15px; border-radius: 8px; margin-top: 20px; font-size: 12px; color: #00d1b2; word-break: break-all; }
        </style>
    </head>
    <body>
        <div class="card">
            <img src="/logo.png" alt="Logo">
            <h1>Altyazı Servisi</h1>
            <p>Stremio için özel altyazı eklentiniz şu an aktif ve hazır.</p>
            <button id="installBtn" class="btn" style="display:none;">Uygulama Olarak Yükle</button>
            <code>https://${req.get('host')}/manifest.json</code>
        </div>

        <script>
            let deferredPrompt;
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                deferredPrompt = e;
                document.getElementById('installBtn').style.display = 'block';
            });

            document.getElementById('installBtn').addEventListener('click', () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then((choice) => {
                        if (choice.outcome === 'accepted') console.log('Yüklendi');
                        deferredPrompt = null;
                    });
                }
            });
        </script>
    </body>
    </html>
    `);
});

// --- 2. TELEFON İÇİN WEB MANIFEST (PWA) ---
app.get('/web-manifest.json', (req, res) => {
    res.json({
        "name": "Altyazi Servisi",
        "short_name": "Altyazi",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#0f0f0f",
        "theme_color": "#00d1b2",
        "icons": [
            { "src": "/logo.png", "sizes": "192x192", "type": "image/png" },
            { "src": "/logo.png", "sizes": "512x512", "type": "image/png" }
        ]
    });
});

// --- 3. STREMIO MANIFEST ---
app.get('/manifest.json', (req, res) => {
    res.json({
        id: "com.render.akillialtyazi",
        version: "3.5.0",
        name: "Akıllı Altyazi",
        description: "Haikyuu ve Thunderbolts Fix + Mobil Uygulama Desteği",
        logo: `https://${req.get('host')}/logo.png`,
        resources: ["subtitles"],
        types: ["movie", "series", "anime"],
        idPrefixes: ["tt", "kitsu"]
    });
});

// --- 4. ALTYAZI MOTORU (KESİN FİLTRE KORUNDU) ---
app.get('/subtitles/:type/:id/:extra.json', async (req, res) => {
    const { type, id } = req.params;
    const [rawId, season, episode] = id.split(':');
    const subsDir = path.join(__dirname, 'subs');
    if (!fs.existsSync(subsDir)) return res.json({ subtitles: [] });

    const targetSeason = season ? parseInt(season) : null;
    const s_pad = season ? season.padStart(2, '0') : "";
    const e_pad = episode ? episode.padStart(2, '0') : "";

    let movieName = "";
    try {
        const metaType = type === 'movie' ? 'movie' : 'series';
        const response = await axios.get(`https://v3-cinemeta.strem.io/meta/${metaType}/${rawId}.json`);
        if (response.data && response.data.meta) {
            movieName = response.data.meta.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
        }
    } catch (err) {}

    let matchedOptions = [];

    function searchFiles(dir, relativePath = "") {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
            const lowerName = item.name.toLowerCase();
            const cleanItemName = lowerName.replace(/[^a-z0-9]/g, ' ');
            const relPath = relativePath ? path.join(relativePath, item.name) : item.name;
            const fullPath = path.join(dir, item.name);

            const pathParts = relPath.toLowerCase().split(path.sep);
            let pathSeason = null;
            for (const part of pathParts) {
                const sMatch = part.match(/(?:sezon|season|s)\s*(\d+)/);
                if (sMatch) { pathSeason = parseInt(sMatch[1]); break; }
            }

            if (type !== 'movie' && targetSeason && pathSeason !== null && pathSeason !== targetSeason) continue;

            if (item.isDirectory()) {
                if (type === 'movie' && movieName) {
                    const movieWords = movieName.split(/\s+/).filter(w => w.length > 2);
                    const folderMatches = movieWords.every(word => cleanItemName.includes(word));
                    if (relativePath === "" && !folderMatches && !cleanItemName.includes(rawId.replace(/\D/g, ''))) continue;
                }
                searchFiles(fullPath, relPath);
            } else if (item.name.endsWith('.srt')) {
                if (type !== 'movie') {
                    const epPatterns = [`e${e_pad}`, `x${e_pad}`, `ep${e_pad}`, `-${e_pad}`, `_${e_pad}`, ` ${e_pad}`, ` ${episode} `];
                    const isCorrectEp = epPatterns.some(p => lowerName.includes(p));
                    const hasWrongS = lowerName.includes('s0') && !lowerName.includes(`s${s_pad}`);
                    if (isCorrectEp && !hasWrongS) addSubtitle(item.name, relPath);
                } else {
                    const movieWords = movieName.split(/\s+/).filter(w => w.length > 2);
                    const fileMatches = movieWords.some(word => cleanItemName.includes(word));
                    if (fileMatches || lowerName.includes(movieName.replace(/\s+/g, ''))) addSubtitle(item.name, relPath);
                }
            }
        }
    }

    function addSubtitle(name, p) {
        matchedOptions.push({
            id: `sub-${name}-${Math.random()}`,
            url: `https://${req.get('host')}/download/${encodeURIComponent(p)}`,
            lang: "Turkish",
            label: `✅ ${name.replace('.srt', '')}`
        });
    }

    searchFiles(subsDir);
    res.json({ subtitles: matchedOptions });
});

// --- 5. İNDİRME ---
app.get('/download/:path*', (req, res) => {
    const fullPath = decodeURIComponent(req.params.path + (req.params[0] || ''));
    const filePath = path.join(__dirname, 'subs', fullPath);
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
        res.download(filePath);
    } else {
        res.status(404).send("Dosya bulunamadı.");
    }
});

app.listen(process.env.PORT || 8080);
