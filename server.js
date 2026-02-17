const axios = require('axios');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.static(__dirname));

// --- AKILLI PUANLAMA FONKSİYONU (Anime/Film İsmi Eşleştirme) ---
function calculateMatchScore(query, fileName) {
    if (!query || !fileName) return 0;
    // İsimleri temizle ve kelimelere böl
    const queryWords = query.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(w => w.length > 2);
    const fileWords = fileName.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/);

    let matches = 0;
    queryWords.forEach(word => {
        if (fileWords.includes(word)) matches++;
    });
    return matches / queryWords.length;
}

// --- 1. ANA SAYFA (Logo ve Uyandırma) ---
app.get('/', (req, res) => {
    const host = req.get('host');
    res.send(`
        <html>
            <head>
                <link rel="manifest" href="/site.webmanifest">
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
        id: "com.render.akillialtyazi",
        version: "2.0.0",
        name: "Akıllı Altyazi Servisi",
        description: "İsimden otomatik eşleşme (Anime & Film)",
        logo: `https://${req.get('host')}/logo.png`,
        resources: ["subtitles"],
        types: ["movie", "series", "anime"],
        idPrefixes: ["tt", "kitsu", "libvlc"]
    });
});

// --- 3. EVRENSEL DİZİ & FİLM EŞLEŞTİRİCİ ---
app.get('/subtitles/:type/:id/:extra.json', async (req, res) => {
    const { type, id } = req.params;
    const idParts = id.split(':'); // [tt..., sezon, bolum]
    const imdbId = idParts[0];
    const season = idParts[1];
    const episode = idParts[2];
    
    const subsDir = path.join(__dirname, 'subs');
    if (!fs.existsSync(subsDir)) return res.json({ subtitles: [] });
    const files = fs.readdirSync(subsDir).filter(f => f.endsWith('.srt'));

    let movieName = "";
    try {
        const metaType = type === 'movie' ? 'movie' : 'series';
        const response = await fetch(`https://v3-cinemeta.strem.io/meta/${metaType}/${imdbId}.json`);
        const data = await response.json();
        if (data && data.meta) movieName = data.meta.name;
    } catch (err) { console.log("Meta çekilemedi."); }

    let matchedOptions = [];

    files.forEach(file => {
        const fileName = file.toLowerCase();
        let score = calculateMatchScore(movieName, file);
        
        // --- DİZİ/ANİME MANTIĞI ---
        if (type !== 'movie' && season && episode) {
            const s = season.padStart(2, '0'); // 1 -> 01
            const e = episode.padStart(2, '0'); // 5 -> 05
            
            // Dosya adında hem isim hem de "S01E05" veya "1x05" geçiyor mu?
            const hasEpisodeInfo = fileName.includes(`s${s}e${e}`) || 
                                   fileName.includes(`${season}x${e}`) ||
                                   (fileName.includes(`ep${e}`) && score > 0.3);

            if (hasEpisodeInfo && (score > 0.3 || fileName.includes(imdbId))) {
                matchedOptions.push({
                    id: `series-${file}`,
                    url: `https://${req.get('host')}/download/${encodeURIComponent(file)}`,
                    lang: "Turkish",
                    label: `📺 S${s}E${e} | ${file.replace('.srt', '')}`
                });
            }
        } 
        // --- FİLM MANTIĞI ---
        else if (score >= 0.4 || fileName.includes(imdbId)) {
            matchedOptions.push({
                id: `movie-${file}`,
                url: `https://${req.get('host')}/download/${encodeURIComponent(file)}`,
                lang: "Turkish",
                label: `🎬 ${movieName}: ${file.replace('.srt', '')}`
            });
        }
    });

    // Sonuç yoksa "Yedek Plan" (Hepsini göster)
    if (matchedOptions.length > 0) {
        res.json({ subtitles: matchedOptions });
    } else {
        res.json({ subtitles: files.map(f => ({
            id: `manual-${f}`,
            url: `https://${req.get('host')}/download/${encodeURIComponent(f)}`,
            lang: "Turkish",
            label: `📂 Manuel: ${f.replace('.srt', '')}`
        }))});
    }
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

// --- 5. WEB MANIFEST ---
app.get('/site.webmanifest', (req, res) => {
    res.json({
        "name": "Stremio Altyazi",
        "short_name": "Altyazi",
        "icons": [
            { "src": "/logo.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
            { "src": "/logo.png", "sizes": "512x512", "type": "image/png" }
        ],
        "start_url": "/",
        "display": "standalone",
        "background_color": "#111111",
        "theme_color": "#111111"
    });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
