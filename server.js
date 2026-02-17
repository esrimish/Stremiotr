const axios = require('axios');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.static(__dirname));

// --- AKILLI PUANLAMA (Klasör Doğrulaması İçin) ---
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

// --- 1. ANA SAYFA (Logolar Korundu) ---
app.get('/', (req, res) => {
    const host = req.get('host');
    res.send(`<html><body style="background:#111;color:white;text-align:center;padding:50px;">
        <img src="/logo.png" style="width:120px;border-radius:20px;">
        <h1>Altyazi Servisi <span style="color:#00ff00">AKTIF</span></h1>
        <p>Sadece ilgili bölümler listelenir.</p>
    </body></html>`);
});

// --- 2. STREMIO MANIFEST ---
app.get('/manifest.json', (req, res) => {
    res.json({
        id: "com.render.akillialtyazi",
        version: "2.1.0",
        name: "Akıllı Altyazi Servisi",
        description: "Nokta atışı bölüm eşleme",
        logo: `https://${req.get('host')}/logo.png`,
        resources: ["subtitles"],
        types: ["movie", "series", "anime"],
        idPrefixes: ["tt", "kitsu", "libvlc"]
    });
});

// --- 3. SPESİFİK ALTYAZI BULUCU ---
app.get('/subtitles/:type/:id/:extra.json', async (req, res) => {
    const { type, id } = req.params;
    const [rawId, season, episode] = id.split(':');
    const subsDir = path.join(__dirname, 'subs');
    
    if (!fs.existsSync(subsDir)) return res.json({ subtitles: [] });

    let movieName = "";
    try {
        const metaType = type === 'movie' ? 'movie' : 'series';
        const response = await axios.get(`https://v3-cinemeta.strem.io/meta/${metaType}/${rawId}.json`);
        if (response.data && response.data.meta) movieName = response.data.meta.name;
    } catch (err) {}

    let matchedOptions = [];
    const s_pad = season ? season.padStart(2, '0') : "";
    const e_pad = episode ? episode.padStart(2, '0') : "";

    function searchFiles(dir, relativePath = "") {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const item of items) {
            const currentRelPath = relativePath ? path.join(relativePath, item.name) : item.name;
            const fullPath = path.join(dir, item.name);

            if (item.isDirectory()) {
                const folderLower = item.name.toLowerCase();
                // SEZON KONTROLÜ: Eğer klasör adında "Season 2" geçiyor ama biz 1. sezondaysak bu klasöre HİÇ GİRME
                if ((folderLower.includes('season') || folderLower.includes('sezon')) && season) {
                    const folderNum = folderLower.match(/\d+/);
                    if (folderNum && folderNum[0] !== season && folderNum[0] !== s_pad) continue;
                }
                searchFiles(fullPath, currentRelPath);
            } else if (item.name.endsWith('.srt')) {
                const fileName = item.name.toLowerCase();
                
                // BÖLÜM KONTROLÜ (Spesifik filtreleme)
                const patterns = [`e${e_pad}`, `x${e_pad}`, `ep${e_pad}`, `-${e_pad}`, `_${e_pad}`, ` ${e_pad}`, ` ${episode} `];
                const isCorrectEp = patterns.some(p => fileName.includes(p));
                
                // SEZON KONTROLÜ (Dosya adı içindeki S01, S02 kontrolü)
                const hasSeasonInfo = fileName.includes('s0') || fileName.includes('s1') || fileName.includes('s2');
                const isCorrectSeason = !season || fileName.includes(`s${s_pad}`) || !hasSeasonInfo;

                if (isCorrectEp && isCorrectSeason) {
                    matchedOptions.push({
                        id: `sub-${item.name}-${Math.random()}`,
                        url: `https://${req.get('host')}/download/${encodeURIComponent(currentRelPath)}`,
                        lang: "Turkish",
                        label: `✅ ${item.name.replace('.srt', '')}`
                    });
                }
            }
        }
    }

    searchFiles(subsDir);
    res.json({ subtitles: matchedOptions });
});

// --- 4. İNDİRME ---
app.get('/download/:path*', (req, res) => {
    const fullPath = decodeURIComponent(req.params.path + (req.params[0] || ''));
    const filePath = path.join(__dirname, 'subs', fullPath);
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
        res.download(filePath);
    } else {
        res.status(404).send("Bulunamadi.");
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Port: ${PORT}`));
