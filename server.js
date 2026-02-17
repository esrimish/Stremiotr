const axios = require('axios');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

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
                    img { width: 120px; border-radius: 20px; }
                    .status { color: #00ff00; font-weight: bold; }
                </style>
            </head>
            <body>
                <h1>Altyazi Servisi <span class="status">AKTIF</span></h1>
                <p>Sunucu uyanık.</p>
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

    let movieName = "";
    try {
        const metaType = type === 'movie' ? 'movie' : 'series';
        const response = await axios.get(`https://v3-cinemeta.strem.io/meta/${metaType}/${rawId}.json`);
        if (response.data && response.data.meta) movieName = response.data.meta.name;
    } catch (err) { }

    const entries = fs.readdirSync(subsDir, { withFileTypes: true });
    let matchedOptions = [];
    const s_pad = season ? season.padStart(2, '0') : "";
    const e_pad = episode ? episode.padStart(2, '0') : "";

    function filterAndAdd(fileList, relativePath) {
        fileList.forEach(f => {
            const fileName = f.toLowerCase();
            const patterns = [`e${e_pad}`, `x${e_pad}`, `-${e_pad}`, ` ${e_pad} `, ` ${episode} `, `ep${e_pad}`, `_${e_pad}`];
            const isCorrectEpisode = patterns.some(p => fileName.includes(p));
            const hasWrongSeason = season && fileName.includes('s0') && !fileName.includes(`s${s_pad}`);

            if (isCorrectEpisode && !hasWrongSeason) {
                matchedOptions.push({
                    id: `match-${f}-${Math.random()}`,
                    url: `https://${req.get('host')}/download/${encodeURIComponent(relativePath + '/' + f)}`,
                    lang: "Turkish",
                    label: `✅ ${f.replace('.srt', '')}`
                });
            }
        });
    }

    for (const entry of entries) {
        if (entry.isDirectory()) {
            const folderName = entry.name.toLowerCase();
            const folderScore = calculateMatchScore(movieName, entry.name);

            if (folderScore >= 0.4 || folderName.includes(imdbId) || (movieName && folderName.includes(movieName.toLowerCase()))) {
                const subEntries = fs.readdirSync(path.join(subsDir, entry.name), { withFileTypes: true });
                for (const subEntry of subEntries) {
                    const subName = subEntry.name.toLowerCase();
                    if (subEntry.isDirectory()) {
                        const isAnySeasonFolder = subName.includes('sezon') || subName.includes('season') || subName.includes('s0') || subName.includes('s1') || subName.includes('s2');
                        const isOurSeason = subName.includes(`sezon ${season}`) || subName.includes(`season ${season}`) || subName.includes(`s${s_pad}`);
                        if (isAnySeasonFolder && !isOurSeason) continue;

                        const srtFiles = fs.readdirSync(path.join(subsDir, entry.name, subEntry.name)).filter(f => f.endsWith('.srt'));
                        filterAndAdd(srtFiles, entry.name + '/' + subEntry.name);
                    } else if (subEntry.name.endsWith('.srt')) {
                        filterAndAdd([subEntry.name], entry.name);
                    }
                }
            }
        }
    }
    res.json({ subtitles: matchedOptions });
});

// --- 4. ALTYAZI İNDİRME ---
app.get('/download/:filename*', (req, res) => {
    const relativePath = decodeURIComponent(req.params.filename + (req.params[0] || ''));
    const filePath = path.join(__dirname, 'subs', relativePath);
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
