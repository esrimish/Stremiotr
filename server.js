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
    const filePath = path.join(__dirname, 'subs', req.params.filename);
    
    if (fs.existsSync(filePath)) {
        // Altyazı dosyasının içeriğini oku
        let content = fs.readFileSync(filePath);

        // TV'ye bu dosyanın UTF-8 olduğunu ve altyazı formatında olduğunu söyle
        res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=${req.params.filename}`);
        
        res.send(content);
    } else {
        res.status(404).send("Altyazi bulunamadi.");
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

