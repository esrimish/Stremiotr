const axios = require('axios');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.static(__dirname));

// --- 1. MANIFEST ---
app.get('/manifest.json', (req, res) => {
    res.json({
        id: "com.render.akillialtyazi",
        version: "3.4.0",
        name: "Akıllı Altyazi (Kesin Çözüm)",
        description: "Thunderbolts ve Haikyuu Fix",
        logo: `https://${req.get('host')}/logo.png`,
        resources: ["subtitles"],
        types: ["movie", "series", "anime"],
        idPrefixes: ["tt", "kitsu"]
    });
});

// --- 2. ALTYAZI MOTORU ---
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
            // Film ismindeki *, :, - gibi işaretleri temizleyerek ham ismi al
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

            // --- SEZON KONTROLÜ (Dizi/Anime için) ---
            const pathParts = relPath.toLowerCase().split(path.sep);
            let pathSeason = null;
            
            for (const part of pathParts) {
                // Sadece "sezon 1" veya "s1" gibi yapıları yakala, 733645 gibi kodları sezon sanma
                const sMatch = part.match(/(?:sezon|season|s)\s*(\d+)/);
                if (sMatch) {
                    pathSeason = parseInt(sMatch[1]);
                    break; 
                }
            }

            // Eğer Sezon 1 izliyorsak ve yol "Sezon 2" içeriyorsa pas geç
            if (type !== 'movie' && targetSeason && pathSeason !== null && pathSeason !== targetSeason) {
                continue; 
            }

            if (item.isDirectory()) {
                // FİLM FİLTRESİ (Thunderbolts Fix)
                if (type === 'movie' && movieName) {
                    // Film ismi klasör isminde geçiyor mu? (Boşluklara duyarlı olmadan bak)
                    const movieWords = movieName.split(/\s+/).filter(w => w.length > 2);
                    const folderMatches = movieWords.every(word => cleanItemName.includes(word));
                    
                    // Eğer ana klasörlerdeyiz ve isim uyuşmuyorsa içeri girme
                    if (relativePath === "" && !folderMatches && !cleanItemName.includes(rawId.replace(/\D/g, ''))) {
                        continue;
                    }
                }
                searchFiles(fullPath, relPath);
            } else if (item.name.endsWith('.srt')) {
                if (type !== 'movie') {
                    // BÖLÜM KONTROLÜ
                    const epPatterns = [`e${e_pad}`, `x${e_pad}`, `ep${e_pad}`, `-${e_pad}`, `_${e_pad}`, ` ${e_pad}`, ` ${episode} `];
                    const isCorrectEp = epPatterns.some(p => lowerName.includes(p));
                    const hasWrongS = lowerName.includes('s0') && !lowerName.includes(`s${s_pad}`);

                    if (isCorrectEp && !hasWrongS) {
                        addSubtitle(item.name, relPath);
                    }
                } else {
                    // FİLM: Sadece film ismindeki anahtar kelimeler geçiyorsa ekle
                    const movieWords = movieName.split(/\s+/).filter(w => w.length > 2);
                    const fileMatches = movieWords.some(word => cleanItemName.includes(word));
                    
                    if (fileMatches || lowerName.includes(movieName.replace(/\s+/g, ''))) {
                        addSubtitle(item.name, relPath);
                    }
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
