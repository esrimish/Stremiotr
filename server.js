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

// --- 3. AKILLI ALTYAZI LİSTELEME ---
// --- 3. AKILLI ALTYAZI LİSTELEME (GELİŞMİŞ FİLTRELEME + YEDEK PLAN) ---
app.get('/subtitles/:type/:id/:extra.json', (req, res) => {
    const imdbId = req.params.id.split(':')[0];
    const extra = req.params.extra;
    const subsDir = path.join(__dirname, 'subs');
    
    if (!fs.existsSync(subsDir)) return res.json({ subtitles: [] });
    const files = fs.readdirSync(subsDir).filter(f => f.endsWith('.srt'));

    // Stremio'dan gelen film ismini yakala
    const urlParams = new URLSearchParams(extra.replace(".json", ""));
    const movieName = urlParams.get('name');

    let matchedOptions = [];

    files.forEach(file => {
        // 1. IMDb ID kontrolü (En yüksek öncelik)
        if (file.includes(imdbId)) {
            matchedOptions.push({
                id: `id-${file}`,
                url: `https://${req.get('host')}/download/${encodeURIComponent(file)}`,
                lang: "Turkish",
                label: `🎯 TAM EŞLEŞME: ${file.replace('.srt', '')}`
            });
        } else {
            // 2. İsim puanlaması (Anime ve diğerleri için)
            const score = calculateMatchScore(movieName, file);
            
            // Hassasiyet: %40 ve üzeri benzerlik varsa listeye ekle
            if (score >= 0.4) {
                matchedOptions.push({
                    id: `match-${file}`,
                    url: `https://${req.get('host')}/download/${encodeURIComponent(file)}`,
                    lang: "Turkish",
                    label: `⭐ %${Math.round(score * 100)} Uygun: ${file.replace('.srt', '')}`
                });
            }
        }
    });

    // SONUÇ DÖNDÜRME MANTIĞI:
    if (matchedOptions.length > 0) {
        // Eğer akıllı eşleşme bir şeyler bulduysa sadece onları göster
        res.json({ subtitles: matchedOptions });
    } else {
        // HİÇBİR ŞEY BULUNAMAZSA: Klasördeki tüm dosyaları listele (Yedek Plan)
        const allFiles = files.map(f => ({
            id: `all-${f}`,
            url: `https://${req.get('host')}/download/${encodeURIComponent(f)}`,
            lang: "Turkish",
            label: `📂 Tüm Dosyalardan: ${f.replace('.srt', '')}`
        }));
        res.json({ subtitles: allFiles });
    }
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
