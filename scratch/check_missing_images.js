const fs = require('fs');
const path = require('path');

const repoRoot = '/home/jcoronado/Desktop/dev/flashcard';
const jsonDir = path.join(repoRoot, 'json', 'en_es');
const imagesDir = repoRoot; // El imagePath ya empieza con /card_images/

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

try {
    const jsonFiles = walk(jsonDir);
    const declaredImages = new Set();
    let totalCards = 0;
    let totalDefinitions = 0;

    jsonFiles.forEach((file) => {
        const content = fs.readFileSync(file, 'utf8');
        const cards = JSON.parse(content);
        cards.forEach((card) => {
            totalCards++;
            if (card.definitions) {
                card.definitions.forEach((def) => {
                    totalDefinitions++;
                    if (def.imagePath) {
                        // El path puede tener ?v=... o no, nos quedamos con la parte del archivo
                        const cleanPath = def.imagePath.split('?')[0];
                        declaredImages.add(cleanPath);
                    }
                });
            }
        });
    });

    let existingCount = 0;
    let missingCount = 0;
    const missingList = [];

    declaredImages.forEach((imgRelPath) => {
        const fullImgPath = path.join(imagesDir, imgRelPath);
        if (fs.existsSync(fullImgPath)) {
            existingCount++;
        } else {
            missingCount++;
            missingList.push(imgRelPath);
        }
    });

    console.log(JSON.stringify({
        totalDecks: jsonFiles.length,
        totalCards: totalCards,
        totalDefinitions: totalDefinitions,
        uniqueDeclaredImages: declaredImages.size,
        existingImages: existingCount,
        missingImages: missingCount,
        someMissingExamples: missingList.slice(0, 10)
    }, null, 2));

} catch (err) {
    console.error('Error:', err);
}
