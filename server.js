const axios = require('axios');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.static(__dirname));

// --- 1. MOBİL UYUMLU ANA SAYFA (YÜKLE BUTONLU) ---
// --- 1. ANA SAYFA GÜNCELLEME ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Altyazı Servisi</title>
        <link rel="manifest" href="/web-manifest.json">
        <meta name="theme-color" content="#00d1b2">
        <style>
            body { background: #0f0f0f; color: white; font-family: 'Segoe UI', sans-serif; text-align: center; padding: 20px; margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; }
            .card { background: #1a1a1a; padding: 40px 20px; border-radius: 30px; box-shadow: 0 15px 35px rgba(0,0,0,0.7); max-width: 350px; width: 100%; border: 1px solid #333; }
            .logo-container { width: 120px; height: 120px; margin: 0 auto 20px; position: relative; }
            img { width: 100%; height: 100%; object-fit: cover; border-radius: 25px; border: 3px solid #00d1b2; box-shadow: 0 0 15px rgba(0, 209, 178, 0.3); }
            h1 { font-size: 26px; margin: 0 0 10px; color: #fff; font-weight: 800; }
            p { color: #888; font-size: 15px; margin-bottom: 25px; }
            .btn { background: #00d1b2; color: #000; border: none; padding: 15px; border-radius: 12px; font-weight: bold; cursor: pointer; width: 100%; font-size: 16px; transition: transform 0.2s; }
            .btn:active { transform: scale(0.95); }
            code { display: block; background: #000; padding: 15px; border-radius: 10px; margin-top: 20px; font-size: 11px; color: #00d1b2; border: 1px dashed #444; word-break: break-all; }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="logo-container">
                <img src="/logo.png" alt="Logo">
            </div>
            <h1>Altyazı Servisi</h1>
            <p>Stremio eklentiniz aktif.</p>
            <button id="installBtn" class="btn" style="display:none;">Uygulamayı Yükle</button>
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
                    deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
                }
            });
        </script>
    </body>
    </html>
    `);
});

// --- 2. WEB MANIFEST GÜNCELLEME (Tam Ekran İkon İçin) ---
app.get('/web-manifest.json', (req, res) => {
    res.json({
        "name": "Altyazi Servisi",
        "short_name": "Altyazi",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#0f0f0f",
        "theme_color": "#00d1b2",
        "icons": [
            {
                "src": "/logo.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "any" 
            },
            {
                "src": "/logo.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "maskable"
            }
        ]
    });
});
// --- 3. STREMIO MANIFEST ---
app.get('/manifest.json', (req, res) => {
    res.json({
        id: "com.render.akillialtyazi",
        version: "3.5.0",
        name: "Esrimish Manual Subs",
        description: "Akilli secme ozellikli nihai surum",
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
