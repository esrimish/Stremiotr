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
    const [rawId, season, episode] = id.split(':');
    const imdbId = rawId.replace('kitsu:', '');
    const subsDir = path.join(__dirname, 'subs');
    
    if (!fs.existsSync(subsDir)) return res.json({ subtitles: [] });

    // 1. Stremio'dan ismi al
    let movieName = "";
    try {
        const metaType = type === 'movie' ? 'movie' : 'series';
        const response = await fetch(`https://v3-cinemeta.strem.io/meta/${metaType}/${rawId}.json`);
        const data = await response.json();
        if (data && data.meta) movieName = data.meta.name;
    } catch (err) { }

    const entries = fs.readdirSync(subsDir, { withFileTypes: true });
    let matchedOptions = [];

    // Sezon ve Bölüm formatlarını hazırla (Örn: S01, E01)
    const s_pad = season ? season.padStart(2, '0') : "";
    const e_pad = episode ? episode.padStart(2, '0') : "";

    // 2. KLASÖR TARAMASI
    for (const entry of entries) {
        if (entry.isDirectory()) {
            const folderName = entry.name.toLowerCase();
            const folderScore = calculateMatchScore(movieName, entry.name);

            // ANA KLASÖRÜ BUL (Haikyuu)
            if (folderScore >= 0.4 || folderName.includes(imdbId) || (movieName && folderName.includes(movieName.toLowerCase()))) {
                
                const subEntries = fs.readdirSync(path.join(subsDir, entry.name), { withFileTypes: true });
                
                for (const subEntry of subEntries) {
                    const subName = subEntry.name.toLowerCase();
                    
                    if (subEntry.isDirectory()) {
                        // --- SEZON FİLTRESİ ---
                        // Eğer klasör "Sezon" içeriyorsa ve bizim sezonumuz değilse PAS GEÇ
                        const isAnySeasonFolder = subName.includes('sezon') || subName.includes('season') || subName.includes('s0') || subName.includes('s1') || subName.includes('s2');
                        const isOurSeason = subName.includes(`sezon ${season}`) || subName.includes(`season ${season}`) || subName.includes(`s${s_pad}`);

                        if (isAnySeasonFolder && !isOurSeason) continue;

                        // Doğru sezon klasöründeyiz veya sezon belirtilmemiş bir klasördeyiz
                        const srtFiles = fs.readdirSync(path.join(subsDir, entry.name, subEntry.name)).filter(f => f.endsWith('.srt'));
                        filterAndAdd(srtFiles, path.join(entry.name, subEntry.name));
                    } else if (subEntry.name.endsWith('.srt')) {
                        // Ana klasörün içindeki dosyalar (Sezon klasörüne girmemişse)
                        filterAndAdd([subEntry.name], entry.name);
                    }
                }
            }
        }
    }

    // Dosyayı sadece İSTEDİĞİMİZ BÖLÜM ise listeye ekleyen fonksiyon
    function filterAndAdd(fileList, relativePath) {
        fileList.forEach(f => {
            const fileName = f.toLowerCase();
            
            // BÖLÜM KONTROLÜ (Çok Katı)
            // " 01 ", "-01", "e01", "x01" gibi kalıpları arar
            const patterns = [`e${e_pad}`, `x${e_pad}`, `-${e_pad}`, ` ${e_pad} `, ` ${episode} `, `ep${e_pad}`, `_${e_pad}`];
            const isCorrectEpisode = patterns.some(p => fileName.includes(p));

            // SEZON ÇAKIŞMA KONTROLÜ
            // Eğer dosya adında S02 yazıyorsa ama biz S01 istiyorsak alma
            const hasWrongSeason = season && fileName.includes('s0') && !fileName.includes(`s${s_pad}`);

            if (isCorrectEpisode && !hasWrongSeason) {
                matchedOptions.push({
                    id: `match-${f}`,
                    url: `https://${req.get('host')}/download/${encodeURIComponent(relativePath + '/' + f)}`,
                    lang: "Turkish",
                    label: `✅ ${f.replace('.srt', '')}`
                });
            }
        });
    }

    // 3. SONUÇ
    res.json({ subtitles: matchedOptions });
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
