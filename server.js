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
    const [imdbId, season, episode] = id.split(':');
    const subsDir = path.join(__dirname, 'subs');
    
    if (!fs.existsSync(subsDir)) return res.json({ subtitles: [] });

    // 1. Film/Anime Adını İnternetten Çek
    let movieName = "";
    try {
        const metaType = type === 'movie' ? 'movie' : 'series';
        const response = await fetch(`https://v3-cinemeta.strem.io/meta/${metaType}/${imdbId}.json`);
        const data = await response.json();
        if (data && data.meta) movieName = data.meta.name;
    } catch (err) { console.log("İsim çekilemedi."); }

    let finalFiles = [];
    const entries = fs.readdirSync(subsDir, { withFileTypes: true });

    // 2. Klasör ve Dosya Taraması
    entries.forEach(entry => {
        const entryName = entry.name.toLowerCase();
        const cleanMovieName = movieName.toLowerCase();

        if (entry.isDirectory()) {
            // KLASÖR MANTIĞI: Klasör adı film adıyla uyuşuyor mu? (%40 kuralı)
            const folderScore = calculateMatchScore(movieName, entry.name);
            if (folderScore >= 0.4 || entryName.includes(imdbId) || entryName.includes(cleanMovieName)) {
                // Eğer klasör doğruysa, sadece bu klasörün içindeki SRT'leri listeye al
                const subFiles = fs.readdirSync(path.join(subsDir, entry.name))
                                   .filter(f => f.endsWith('.srt'));
                subFiles.forEach(f => finalFiles.push({ name: f, path: path.join(entry.name, f), fromFolder: true }));
            }
        } else if (entry.name.endsWith('.srt')) {
            // DOSYA MANTIĞI: Klasör dışında duran tekil dosyalar
            finalFiles.push({ name: entry.name, path: entry.name, fromFolder: false });
        }
    });

    let matchedOptions = [];
    const s = season ? season.padStart(2, '0') : null;
    const e = episode ? episode.padStart(2, '0') : null;

    // 3. Bulunan Dosyalar İçinde Bölüm Filtrelemesi
    finalFiles.forEach(fileObj => {
        const fileName = fileObj.name.toLowerCase();
        let isMatch = false;

        if (type !== 'movie' && s && e) {
            // Dizi/Anime ise: Sezon ve Bölüm kontrolü
            if (fileName.includes(`s${s}e${e}`) || fileName.includes(`${season}x${e}`) || fileName.includes(`e${e}`) || fileName.includes(` ${episode} `) || fileName.includes(`-${e}`)) {
                isMatch = true;
            }
        } else {
            // Film ise: İsim benzerliği kontrolü
            if (calculateMatchScore(movieName, fileObj.name) >= 0.4 || fileName.includes(imdbId)) {
                isMatch = true;
            }
        }

        if (isMatch) {
            matchedOptions.push({
                id: `match-${fileObj.path}`,
                url: `https://${req.get('host')}/download/${encodeURIComponent(fileObj.path)}`,
                lang: "Turkish",
                label: `${fileObj.fromFolder ? '📂 ' : '📄 '}${fileObj.name.replace('.srt', '')}`
            });
        }
    });

    // SONUÇ DÖNDÜRME
    if (matchedOptions.length > 0) {
        res.json({ subtitles: matchedOptions });
    } else {
        // Hiçbir şey bulunamazsa tüm SRT'leri dök (Yedek Plan)
        res.json({ subtitles: finalFiles.map(f => ({
            id: `manual-${f.path}`,
            url: `https://${req.get('host')}/download/${encodeURIComponent(f.path)}`,
            lang: "Turkish",
            label: `🔍 ${f.name}`
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
