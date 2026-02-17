const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());

app.get('/manifest.json', (req, res) => {
    res.json({
        id: "com.render.altyazi",
        version: "1.0.0",
        name: "Render Altyazi Servisi",
        description: "HTTPS Destekli Altyazi",
        resources: ["subtitles"],
        types: ["movie", "series"],
        idPrefixes: ["tt"]
    });
});

app.get('/subtitles/:type/:id/:extra.json', (req, res) => {
    const imdbId = req.params.id.split(':')[0];
    
    // URL'nin başına HTTPS'yi manuel ekleyelim
    const subUrl = `https://${req.get('host')}/download/${imdbId}.srt`;
    
    console.log("🔗 Altyazı Linki Oluşturuldu:", subUrl);

    res.json({
        subtitles: [{
            id: "local-sub",
            url: subUrl,
            lang: "Turkish"
        }]
    });
});

app.get('/download/:filename', (req, res) => {
    // __dirname ile subs klasörüne tam yol çiziyoruz
    const filePath = path.join(__dirname, 'subs', req.params.filename);
    
    console.log("🔍 Aranan Dosya Yolu:", filePath);

    if (fs.existsSync(filePath)) {
        console.log("✅ Dosya bulundu, gönderiliyor.");
        res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
        res.download(filePath);
    } else {
        console.log("❌ Dosya klasörde yok!");
        // Klasörün içindekileri logla ki neyi yanlış yazdığını görelim
        const files = fs.readdirSync(path.join(__dirname, 'subs'));
        console.log("📂 Subs klasöründeki dosyalar:", files);
        
        res.status(404).send(`Altyazi bulunamadi. Aranan: ${req.params.filename}`);
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

