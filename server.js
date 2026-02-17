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
    res.send(`<html><body style="background:#111;color:white;text-align:center;padding:50px;">
        <img src="/logo.png" style="width:120px;border-radius:20px;">
        <h1>Altyazi Servisi <span style="color:#00ff00">AKTIF</span></h1>
        <p>Haikyuu Sezon Klasörü ve Film Filtresi Güncellendi.</p>
    </body></html>`);
});

// --- 2. MANIFEST ---
app.get('/manifest.json', (req, res) => {
    res.json({
        id: "com.render.akillialtyazi",
        version: "3.2.0",
        name: "Akıllı Altyazi",
        description: "Sezon ve Film Ayrımı (Haikyuu Uyumlu)",
        logo: `https://${req.get('host')}/logo.png`,
        resources: ["subtitles"],
        types: ["movie", "series", "anime"],
        idPrefixes: ["tt", "kitsu"]
    });
});

// --- 3. ALTYAZI MOTORU ---
app.get('/subtitles/:type/:id/:extra.json', async (req, res) => {
    const { type, id } = req.params;
    const [rawId, season, episode] = id.split(':');
    const subsDir = path.join(__dirname, 'subs');
    
    if (!fs.existsSync(subsDir)) return res.json({ subtitles: [] });

    const s_pad = season ? season.padStart(2, '0') : "";
    const e_pad = episode ? episode.padStart(2, '0') : "";
    const targetSeason = season ? parseInt(season) : null;

    // Cinemeta'dan film/dizi ismini çek (Filtreleme için şart)
    let movieName = "";
    try {
        const metaType = type === 'movie' ? 'movie' : 'series';
        const response = await axios.get(`https://v3-cinemeta.strem.io/meta/${metaType}/${rawId}.json`);
        if (response.data && response.data.meta) movieName = response.data.meta.name.toLowerCase();
    } catch (err) {}

    let matchedOptions = [];

    function searchFiles(dir, relativePath = "", currentPathSeason = null) {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const item of items) {
            const lowerName = item.name.toLowerCase();
            const relPath = relativePath ? path.join(relativePath, item.name) : item.name;
            const fullPath = path.join(dir, item.name);

            if (item.isDirectory()) {
                let foundSeason = currentPathSeason;
                
                // Klasör isminden sezonu anla (Sezon 1, Season 1, S1 vb.)
                const sMatch = lowerName.match(/(sezon|season)\s*(\d+)/) || lowerName.match(/s(\d+)/);
                if (sMatch) foundSeason = parseInt(sMatch[1] || sMatch[2]);

                // SEZON KİLİDİ: Eğer sezon klasöründeysek ve yanlışsa içeri girme
                if (type !== 'movie' && targetSeason && foundSeason && foundSeason !== targetSeason) {
                    continue;
                }

                // FİLM FİLTRESİ: Eğer film izliyorsak ve klasör ismi filmle alakası yoksa atla
                if (type === 'movie' && movieName && !lowerName.includes(movieName) && relativePath === "") {
                    // Skor kontrolü yerine basit isim içerme kontrolü
                    const isIdMatch = rawId.replace(/\D/g, '') && lowerName.includes(rawId.replace(/\D/g, ''));
                    if (!isIdMatch) continue;
                }

                searchFiles(fullPath, relPath, foundSeason);
            } else if (item.name.endsWith('.srt')) {
                // EĞER ŞU AN YANLIŞ SEZON YOLUNDAYSAK EKLEME
                if (type !== 'movie' && targetSeason && currentPathSeason && currentPathSeason !== targetSeason) continue;

                if (type !== 'movie') {
                    // BÖLÜM KONTROLÜ
                    const epPatterns = [`e${e_pad}`, `x${e_pad}`, `ep${e_pad}`, `-${e_pad}`, `_${e_pad}`, ` ${e_pad}`, ` ${episode} `];
                    const isCorrectEp = epPatterns.some(p => lowerName.includes(p));
                    
                    // Dosya adında S02E01 gibi zıt sezon bilgisi varsa ele
                    const hasWrongS = lowerName.includes('s0') && !lowerName.includes(`s${s_pad}`);

                    if (isCorrectEp && !hasWrongS) {
                        addSubtitle(item.name, relPath);
                    }
                } else {
                    // FİLM: Sadece film ismiyle eşleşeni al (Interstellar her şeyi dökmesin diye)
                    if (movieName && (lowerName.includes(movieName) || relPath.toLowerCase().includes(movieName))) {
                        addSubtitle(item.name, relPath);
                    }
                }
            }
        }
    }

    function addSubtitle(name, path) {
        matchedOptions.push({
            id: `sub-${name}-${Math.random()}`,
            url: `https://${req.get('host')}/download/${encodeURIComponent(path)}`,
            lang: "Turkish",
            label: `✅ ${name.replace('.srt', '')}`
        });
    }

    searchFiles(subsDir);
    res.json({ subtitles: matchedOptions });
});

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

app.listen(process.env.PORT || 8080);
