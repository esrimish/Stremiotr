const axios = require('axios');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.static(__dirname));

// --- DAHA ESNEK PUANLAMA SİSTEMİ ---
function calculateMatchScore(query, fileName) {
    if (!query || !fileName) return 0;
    
    // Yıl bilgisi (2014 gibi) ve özel karakterleri temizle
    const clean = (text) => text.toLowerCase()
        .replace(/\(\d{4}\)/g, "") // (2024) gibi yılları sil
        .replace(/[^a-z0-9]/g, " ")
        .trim();

    const q = clean(query);
    const f = clean(fileName);
    
    const queryWords = q.split(/\s+/).filter(w => w.length > 2);
    const fileWords = f.split(/\s+/);
    
    if (queryWords.length === 0) return f.includes(q) ? 1 : 0;

    let matches = 0;
    queryWords.forEach(word => {
        if (fileWords.includes(word)) matches++;
    });
    
    return matches / queryWords.length;
}

// --- 1. ANA SAYFA ---
app.get('/', (req, res) => {
    const host = req.get('host');
    res.send(`<html><body style="background:#111;color:white;text-align:center;padding:50px;">
        <img src="/logo.png" style="width:120px;border-radius:20px;">
        <h1>Altyazi Servisi <span style="color:#00ff00">AKTIF</span></h1>
        <p>Film eşleme algoritması iyileştirildi.</p>
    </body></html>`);
});

// --- 2. MANIFEST ---
app.get('/manifest.json', (req, res) => {
    res.json({
        id: "com.render.akillialtyazi",
        version: "2.4.0",
        name: "Akıllı Altyazi Servisi",
        description: "Gelişmiş Film & Dizi Eşleme",
        logo: `https://${req.get('host')}/logo.png`,
        resources: ["subtitles"],
        types: ["movie", "series", "anime"],
        idPrefixes: ["tt", "kitsu", "libvlc"]
    });
});

// --- 3. AKILLI ALTYAZI MOTORU ---
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
            const lowerName = item.name.toLowerCase();

            if (item.isDirectory()) {
                // SEZON KONTROLÜ
                if (season && (lowerName.includes('sezon') || lowerName.includes('season') || lowerName.includes(' s0') || lowerName.includes(' s1'))) {
                    const foundSeason = lowerName.match(/\d+/);
                    if (foundSeason && parseInt(foundSeason[0]) !== parseInt(season)) continue;
                }
                searchFiles(fullPath, currentRelPath);
            } else if (item.name.endsWith('.srt')) {
                if (type === 'movie') {
                    // FİLM FİLTRESİ (Daha esnek hale getirildi)
                    const score = calculateMatchScore(movieName, item.name);
                    const movieNameClean = movieName.toLowerCase().replace(/[^a-z0-9]/g, "");
                    const fileNameClean = lowerName.replace(/[^a-z0-9]/g, "");

                    if (score > 0.4 || fileNameClean.includes(movieNameClean)) {
                        addSubtitle(item.name, currentRelPath);
                    }
                } else {
                    // DİZİ/ANİME FİLTRESİ
                    const epPatterns = [`e${e_pad}`, `x${e_pad}`, `ep${e_pad}`, `-${e_pad}`, `_${e_pad}`, ` ${e_pad}`, ` ${episode} `];
                    const isCorrectEp = epPatterns.some(p => lowerName.includes(p));
                    const hasWrongSeasonInfo = season && lowerName.includes('s0') && !lowerName.includes(`s${s_pad}`);

                    if (isCorrectEp && !hasWrongSeasonInfo) {
                        addSubtitle(item.name, currentRelPath);
                    }
                }
            }
        }
    }

    function addSubtitle(name, relPath) {
        matchedOptions.push({
            id: `sub-${name}-${Math.random()}`,
            url: `https://${req.get('host')}/download/${encodeURIComponent(relPath)}`,
            lang: "Turkish",
            label: `✅ ${name.replace('.srt', '')}`
        });
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
        res.status(404).send("Dosya bulunamadı.");
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Sistem Aktif: ${PORT}`));
