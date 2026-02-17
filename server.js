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
    queryWords.forEach(word => { if (fileWords.includes(word)) matches++; });
    return matches / queryWords.length;
}

// --- ANA SAYFA ---
app.get('/', (req, res) => {
    res.send(`<html><body style="background:#111;color:white;text-align:center;padding:50px;"><h1>Altyazi Servisi <span style="color:green">AKTIF</span></h1></body></html>`);
});

// --- STREMIO MANIFEST ---
app.get('/manifest.json', (req, res) => {
    res.json({
        id: "com.render.akillialtyazi",
        version: "2.1.0",
        name: "Akıllı Altyazi",
        resources: ["subtitles"],
        types: ["movie", "series", "anime"],
        idPrefixes: ["tt", "kitsu"]
    });
});

// --- EVRENSEL EŞLEŞTİRİCİ ---
app.get('/subtitles/:type/:id/:extra.json', async (req, res) => {
    const { type, id } = req.params;
    const [rawId, season, episode] = id.split(':');
    const subsDir = path.join(__dirname, 'subs');
    
    if (!fs.existsSync(subsDir)) return res.json({ subtitles: [] });

    let movieName = "";
    try {
        const metaType = type === 'movie' ? 'movie' : 'series';
        const response = await fetch(`https://v3-cinemeta.strem.io/meta/${metaType}/${rawId}.json`);
        const data = await response.json();
        if (data && data.meta) movieName = data.meta.name;
    } catch (err) { console.log("Meta alinamadi"); }

    const entries = fs.readdirSync(subsDir, { withFileTypes: true });
    let matchedOptions = [];
    const s_pad = season ? season.padStart(2, '0') : "";
    const e_pad = episode ? episode.padStart(2, '0') : "";

    function filterAndAdd(fileList, relativePath) {
        fileList.forEach(f => {
            const fileName = f.toLowerCase();
            const patterns = [`e${e_pad}`, `x${e_pad}`, `-${e_pad}`, ` ${e_pad} `, ` ${episode} `, `ep${e_pad}`, `_${e_pad}`];
            const isCorrectEpisode = patterns.some(p => fileName.includes(p));
            // Yanlış sezon klasöründen dosya gelmesini engelle
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
            const isMatch = folderScore >= 0.4 || folderName.includes(rawId.replace('kitsu:','')) || (movieName && folderName.includes(movieName.toLowerCase()));

            if (isMatch) {
                const subEntries = fs.readdirSync(path.join(subsDir, entry.name), { withFileTypes: true });
                for (const subEntry of subEntries) {
                    const subName = subEntry.name.toLowerCase();
                    if (subEntry.isDirectory()) {
                        const isAnySeasonFolder = subName.includes('sezon') || subName.includes('season') || /s\d+/.test(subName);
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

// --- GÜÇLENDİRİLMİŞ İNDİRME (Alt klasör destekli) ---
app.get('/download/:path*', (req, res) => {
    // URL içindeki klasör yapısını (/) doğru çözmek için path* ve params[0] kullanıyoruz
    const relativePath = decodeURIComponent(req.params.path + (req.params[0] || ''));
    const filePath = path.join(__dirname, 'subs', relativePath);
    
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).send("Altyazi bulunamadi: " + relativePath);
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server aktif: ${PORT}`));
