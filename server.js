const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

// Bu satırı server.js'in üst kısımlarına (path tanımlamasından sonra) ekle
app.use(express.static(__dirname)); 

// Logo isteği geldiğinde dosyayı gönder
app.get('/logo.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'logo.png'));
});
app.use(cors());
// 1. Ana sayfaya girince düzgün bir HTML görünsün (Kısayol için gerekli)
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Stremio Altyazi Servisi</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <link rel="apple-touch-icon" href="/logo.png">
                <link rel="icon" type="image/png" href="/logo.png">
                <style>
                    body { font-family: sans-serif; text-align: center; padding: 50px; background: #111; color: white; }
                    img { width: 150px; border-radius: 20px; margin-bottom: 20px; }
                </style>
            </head>
            <body>
                <img src="/logo.png" alt="Logo">
                <h1>Altyazi Servisi Aktif</h1>
                <p>Sunucu uyanık ve hazır!</p>
            </body>
        </html>
    `);
});
app.get('/manifest.json', (req, res) => {
    res.json({
        id: "com.render.altyazi",
        version: "1.0.0",
        name: "Render Altyazi Servisi",
        description: "HTTPS Destekli Altyazi",
        logo: `https://${req.get('host')}/logo.png`, // Simgeyi buradan çekecek
        resources: ["subtitles"],
        types: ["movie", "series"],
        idPrefixes: ["tt"]
    });
});

// Resim dosyasını dışarıya servis etmek için bu satırı da ekle:
app.get('/logo.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'logo.png'));
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

