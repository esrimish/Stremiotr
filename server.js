const axios = require('axios');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

// CORS ayarları Stremio'nun sunucuya erişmesi için hayati önem taşır
app.use(cors());
app.use(express.static(__dirname));

// --- AKILLI PUANLAMA FONKSİYONU ---
function calculateMatchScore(query, fileName) {
    if (!query || !fileName) return 0;
    const queryWords = query.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(w => w.length > 2);
    const fileWords = fileName.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/);
    let matches = 0;
    queryWords.forEach(word => {
        if (fileWords.includes(word)) matches++;
    });
    return queryWords.length > 0 ? matches / queryWords.length : 0;
}

// --- 1. ANA SAYFA ---
app.get('/', (req, res) => {
    const host = req.get('host');
    res.send(`
        <html>
            <head>
                <link rel="manifest" href="/site.webmanifest">
                <title>Stremio Altyazi</title>
                <style>
                    body { font-family: sans-serif; text-align: center; padding: 50px; background: #111; color: white; }
                    img { width: 120px; border-radius: 20px; margin-bottom: 20px; border: 2px solid #333; }
                    .status { color: #00ff00; font-weight: bold; }
                </style>
            </head>
            <body>
                <img src="/logo.png" alt="Logo" onerror="this.style.display='none'">
                <h1>Altyazi Servisi <span class="status">AKTIF</span></h1>
                <p>TV ve Mobil bağlantısı hazır. Sunucu çalışıyor.</p>
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
        description: "Yerel altyazılarınızı Stremio'ya aktarır",
        logo: `https://${req.get('host')}/logo.png`,
        resources: ["subtitles"],
        types: ["movie", "series", "anime"],
        idPrefixes: ["tt", "kitsu", "libvlc"]
    });
});

// --- 3. ALTYAZI BULUCU ---
app.get('/subtitles/:type/:id/:extra.json', async (req, res) => {
    const { type, id } = req.params;
    const [rawId, season, episode] = id.split(':');
    const imdbId = rawId.replace('kitsu:', '');
    const subsDir = path.join(__dirname, 'subs');
    
    let matchedOptions = [];

    if (!fs.existsSync(subsDir)) {
        console.log("Hata: 'subs' klasörü bulunamadı!");
        return res.json({ subtitles: [] });
    }

    let movieName = "";
    try {
        const metaType = type === 'movie' ? 'movie' : 'series';
        const metaUrl = `https://v3-cinemeta.strem.io/meta/${metaType}/${rawId}.json`;
        const response = await axios.get(metaUrl);
        if (response.data && response.data.meta) movieName = response.data.meta.name;
    } catch (err) {
        console.log("Meta verisi alınamadı, isim araması yapılamayacak.");
    }

    const s_pad = season ? season.padStart(2, '0') : "";
    const e_pad = episode ? episode.padStart(2, '0') : "";

    // Recursive dosya tarama (Alt klasörleri de tarar)
    function searchFiles(dir, relativePath = "") {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const file of files) {
            const fullPath = path.join(dir, file.name);
            const currentRelPath = relativePath ? path.join(relativePath, file.name) : file.name;

            if (file.isDirectory()) {
                // Sezon kontrolü: Eğer klasör adı 'Sezon 2' ise ve biz 1'i arıyorsak atla
                const folderLower = file.name.toLowerCase();
                if ((folderLower.includes('season') || folderLower.includes('sezon')) && 
                    season && !folderLower.includes(season) && !folderLower.includes(s_pad)) {
                    continue;
                }
                searchFiles(fullPath, currentRelPath);
            } else if (file.name.endsWith('.srt')) {
                const fileNameLower = file.name.toLowerCase();
                
                // Bölüm numarası eşleşme kontrolü
                const patterns = [`e${e_pad}`, `x${e_pad}`, `ep${e_pad}`, ` ${e_pad}`, `-${e_pad}`, `_${e_pad}`, ` ${episode} `];
                const isCorrectEp = patterns.some(p => fileNameLower.includes(p));
                
                // Sezon çakışma kontrolü
                const isWrongSeason = season && fileNameLower.includes('s0') && !fileNameLower.includes(`s${s_pad}`);

                if (isCorrectEp && !isWrongSeason) {
                    matchedOptions.push({
                        id: `sub-${currentRelPath}`,
                        url: `https://${req.get('host')}/download/${encodeURIComponent(currentRelPath)}`,
                        lang: "Turkish",
                        label: `✅ ${file.name.replace('.srt', '')}`
                    });
                }
            }
        }
    }

    try {
        searchFiles(subsDir);
    } catch (e) {
        console.log("Arama hatası:", e);
    }

    res.setHeader('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate');
    res.json({ subtitles: matchedOptions });
});

// --- 4. DOSYA İNDİRME ---
app.get('/download/:path*', (req, res) => {
    const fullRelPath = decodeURIComponent(req.params.path + (req.params[0] || ''));
    const filePath = path.join(__dirname, 'subs', fullRelPath);

    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'application/x-subrip');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
        res.download(filePath);
    } else {
        res.status(404).send("Altyazi bulunamadi.");
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda baslatildi.`);
});
