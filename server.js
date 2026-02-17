const axios = require('axios');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.static(__dirname));

// --- 1. ANA SAYFA ---
app.get('/', (req, res) => {
    const host = req.get('host');
    res.send(`<html><body style="background:#111;color:white;text-align:center;padding:50px;">
        <img src="/logo.png" style="width:120px;border-radius:20px;">
        <h1>Altyazi Servisi <span style="color:#00ff00">AKTIF</span></h1>
        <p>Klasör Kilidi ve Sezon Doğrulama Sistemi Aktif.</p>
    </body></html>`);
});

// --- 2. MANIFEST ---
app.get('/manifest.json', (req, res) => {
    res.json({
        id: "com.render.akillialtyazi",
        version: "2.8.0",
        name: "Akıllı Altyazi Servisi",
        description: "Sezon Klasörü Kilitli Arama",
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
    
    const pureId = rawId.replace(/\D/g, ''); 
    const currentSeason = season ? parseInt(season) : null;
    
    if (!fs.existsSync(subsDir)) return res.json({ subtitles: [] });

    let movieName = "";
    try {
        const metaType = type === 'movie' ? 'movie' : 'series';
        const response = await axios.get(`https://v3-cinemeta.strem.io/meta/${metaType}/${rawId}.json`);
        if (response.data && response.data.meta) movieName = response.data.meta.name.toLowerCase();
    } catch (err) {}

    let matchedOptions = [];
    const s_pad = season ? season.padStart(2, '0') : "";
    const e_pad = episode ? episode.padStart(2, '0') : "";

    // pathSeason: O an taranan klasörün hangi sezona ait olduğu bilgisi
    function searchFiles(dir, relativePath = "", pathSeason = null) {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const item of items) {
            const currentRelPath = relativePath ? path.join(relativePath, item.name) : item.name;
            const fullPath = path.join(dir, item.name);
            const lowerName = item.name.toLowerCase();

            if (item.isDirectory()) {
                let nextPathSeason = pathSeason;

                // Eğer klasör adı sezon içeriyorsa (Sezon 1, S02 vb.)
                if (lowerName.includes('sezon') || lowerName.includes('season') || /s\d+/.test(lowerName)) {
                    const found = lowerName.match(/\d+/);
                    if (found) {
                        nextPathSeason = parseInt(found[0]);
                    }
                }

                // KLASÖR KİLİDİ: Eğer bir sezon klasöründeysek ve bizim sezonumuz değilse İÇERİ GİRME
                if (currentSeason && nextPathSeason !== null && nextPathSeason !== currentSeason) {
                    continue; 
                }

                searchFiles(fullPath, currentRelPath, nextPathSeason);
            } else if (item.name.endsWith('.srt')) {
                // EĞER ŞU AN YANLIŞ SEZON YOLUNDAYSAK DOSYAYI EKLEME
                if (currentSeason && pathSeason !== null && pathSeason !== currentSeason) {
                    continue;
                }

                if (type !== 'movie') {
                    // BÖLÜM KONTROLÜ
                    const epPatterns = [`e${e_pad}`, `x${e_pad}`, `ep${e_pad}`, `-${e_pad}`, `_${e_pad}`, ` ${e_pad}`, ` ${episode} `];
                    const isCorrectEp = epPatterns.some(p => lowerName.includes(p));
                    
                    // Dosya adında çelişkili sezon bilgisi varsa (Dosya s02e01 ama biz s01 istiyoruz)
                    const hasWrongSeasonInfo = season && lowerName.includes('s0') && !lowerName.includes(`s${s_pad}`);

                    if (isCorrectEp && !hasWrongSeasonInfo) {
                        addSubtitle(item.name, currentRelPath);
                    }
                } else {
                    addSubtitle(item.name, currentRelPath);
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
        res.status(404).send("Bulunamadi.");
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Katı Sezon Filtresi Aktif: ${PORT}`));
