const fs = require('fs');
const path = require('path');

const repoRoot = '/home/jcoronado/Desktop/dev/flashcard';
const jsonDir = path.join(repoRoot, 'json', 'en_es');
const imagesDir = path.join(repoRoot, 'card_images');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(fullPath));
        } else if (file.endsWith('.json')) {
            results.push(fullPath);
        }
    });
    return results;
}

// Sanitizar segmentos de nombres (limpieza básica como el backend)
function sanitizeSegment(str) {
    return str.trim()
        .toLowerCase()
        .replace(/[\s\-]+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
}

try {
    const jsonFiles = walk(jsonDir);
    let totalCards = 0;
    let totalDefinitions = 0;
    let existingCount = 0;
    let missingCount = 0;

    const missingList = [];

    jsonFiles.forEach((file) => {
        // Ejemplo de ruta: json/en_es/nouns/1-basic/animals.json
        // Queremos extraer:
        // category = nouns
        // level = 1-basic
        // deckName = animals
        const relative = path.relative(jsonDir, file);
        const parts = relative.split(path.sep);
        if (parts.length < 3) return; // Fuera de estructura esperada

        const category = parts[0];
        const level = parts[1];
        const deckFile = parts[2];
        const deckName = deckFile.replace('.json', '');

        const content = fs.readFileSync(file, 'utf8');
        const cards = JSON.parse(content);

        cards.forEach((card, cardIndex) => {
            totalCards++;
            if (card.definitions) {
                card.definitions.forEach((def, defIndex) => {
                    totalDefinitions++;

                    // Mapeo de sufijo de forma (V1, V2, V3)
                    // Las formas irregulares pueden requerir v2/v3 si existen
                    const suffixList = [''];
                    // Si la tarjeta tiene formas irregulares (por ejemplo, verbos past/participle)
                    if (card.irregular_past && card.irregular_past.definitions) {
                        suffixList.push('_v2');
                    }
                    if (card.irregular_participle && card.irregular_participle.definitions) {
                        suffixList.push('_v3');
                    }

                    suffixList.forEach((suffix) => {
                        // El nombre del archivo esperado:
                        // level_deckName_card_cardIndex_defDefIndex.avif
                        const filename = `${level}_${deckName}_card_${cardIndex}_def${defIndex}${suffix}.avif`;
                        const imgPath = path.join(imagesDir, category, level, deckName, filename);

                        if (fs.existsSync(imgPath)) {
                            existingCount++;
                        } else {
                            missingCount++;
                            if (missingList.length < 15) {
                                missingList.push(`${category}/${level}/${deckName}/${filename}`);
                            }
                        }
                    });
                });
            }
        });
    });

    console.log(JSON.stringify({
        totalDecks: jsonFiles.length,
        totalCards: totalCards,
        totalDefinitionsToCheck: totalDefinitions,
        existingImages: existingCount,
        missingImages: missingCount,
        percentComplete: ((existingCount / (existingCount + missingCount)) * 100).toFixed(2) + '%',
        someMissingExamples: missingList
    }, null, 2));

} catch (err) {
    console.error('Error:', err);
}
