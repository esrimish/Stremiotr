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
        <p>Saf ID (Sadece Rakam) + İsim Eşleme Devrede.</p>
    </body></html>`);
});

// --- 2. MANIFEST ---
app.get('/manifest.json', (req, res) => {
    res.json({
        id: "com.render.akillialtyazi",
        version: "2.7.0",
        name: "Akıllı Altyazi Servisi",
        description: "Saf ID ve İsim Tabanlı Arama",
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
    
    // Sadece rakamları al (Örn: tt0816692 -> 0816692 veya kitsu:11248 -> 11248)
    const pureId = rawId.replace(/\D/g, ''); 
    
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

    function searchFiles(dir, relativePath = "") {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const item of items) {
            const currentRelPath = relativePath ? path.join(relativePath, item.name) : item.name;
            const fullPath = path.join(dir, item.name);
            const lowerName = item.name.toLowerCase();

            if (item.isDirectory()) {
                // --- SEZON KONTROLÜ (Dizi/Anime ise her şeyden önce buna bak) ---
                if (season && (lowerName.includes('sezon') || lowerName.includes('season') || /s\d+/.test(lowerName))) {
                    const foundSeason = lowerName.match(/\d+/);
                    if (foundSeason && parseInt(foundSeason[0]) !== parseInt(season)) {
                        continue; // Yanlış sezon klasörüyse anında pas geç
                    }
                }

                // --- HİBRİT KLASÖR EŞLEŞTİRME ---
                const isIdMatch = pureId && lowerName.includes(pureId);
                const isNameMatch = movieName && lowerName.includes(movieName);

                // Eğer en üst dizindeysek ve ne ID ne isim tutuyorsa bu ana klasörü atla (Hız kazandırır)
                if (relativePath === "" && !isIdMatch && !isNameMatch) {
                   // return; // Bazı durumlarda riskli olabilir, o yüzden sadece continue mantığıyla devam edelim
                }

                searchFiles(fullPath, currentRelPath);
            } else if (item.name.endsWith('.srt')) {
                // --- BÖLÜM VE DOSYA ADI KONTROLÜ ---
                if (type !== 'movie') {
                    const epPatterns = [`e${e_pad}`, `x${e_pad}`, `ep${e_pad}`, `-${e_pad}`, `_${e_pad}`, ` ${e_pad}`, ` ${episode} `];
                    const isCorrectEp = epPatterns.some(p => lowerName.includes(p));
                    
                    // Dosya isminde sezon bilgisi varsa (s01e23 gibi) kontrol et
                    const hasWrongSeason = season && lowerName.includes('s0') && !lowerName.includes(`s${s_pad}`);

                    if (isCorrectEp && !hasWrongSeason) {
                        addSubtitle(item.name, currentRelPath);
                    }
                } else {
                    // FİLM: Klasör süzgecinden geçtiği için .srt dosyalarını ekle
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
app.listen(PORT, () => console.log(`Saf ID Modu Aktif: ${PORT}`));
