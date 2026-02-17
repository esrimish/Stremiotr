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
    res.json({
        subtitles: [{
            id: "local-sub",
            url: `https://${req.get('host')}/download/${imdbId}.srt`,
            lang: "Turkish"
        }]
    });
});

app.get('/download/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'subs', req.params.filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).send("Altyazi bulunamadi.");
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

