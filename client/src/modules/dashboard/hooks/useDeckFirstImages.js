import { useEffect, useState } from 'react';
import { flashcardPort } from '../../flashcards/composition';
import { imageRepository } from '../../../adapters/studyImageHttpAdapter';

/**
 * Resuelve la primera imagen de cada mazo recomendado igual que lo hace la
 * página de flashcards: pide el deck (`/api/flashcards-data`, que ya trae
 * `learned` por usuario) y toma `definitions[0].imagePath` de la primera
 * tarjeta pendiente — o de la primera del mazo si el usuario nunca lo abrió.
 *
 * ─── POR QUÉ EXISTE ESTE HOOK (historia del bug, Jul 2026) ─────────────────
 * Las recomendaciones del dashboard mostraban siempre la imagen estática de
 * categoría en vez de la primera imagen del mazo. Causas encadenadas:
 *
 * 1. `/api/learning-stats` (que trae `first_image_path` por deck) leía los
 *    ~256 JSONs de decks EN SERIE y tardaba 12-42s; el hook `useLearningStats`
 *    lo cortaba por timeout → `stats = null` → sin imágenes. (El backend ya
 *    se paralelizó con `buffer_unordered(16)` en `mod_flashcards/src/lib.rs`.)
 * 2. NO intentes obtener la imagen desde `catalogOrder.json`: ese archivo usa
 *    nombres display ("Subject", "Being & State") que NO coinciden con los
 *    nombres de archivo reales del backend ("subject_pronouns", "being_state").
 * 3. `/api/resolve-image` tampoco sirve para esto: solo comprueba el path
 *    determinístico nuevo; muchos decks tienen `imagePath` legacy (rutas del
 *    deck agregado viejo, ej. `1-basic_card_12_def0.avif`) que solo viven
 *    dentro del JSON del deck.
 *
 * REGLA: la fuente de verdad de la imagen de un mazo es el propio JSON del
 * deck (`definitions[0].imagePath`), igual que en la página de estudio.
 * Este hook es independiente de `/api/learning-stats`; cada deck es una
 * petición pequeña cacheada en el Map de módulo (sobrevive remounts).
 * ───────────────────────────────────────────────────────────────────────────
 */
const firstImageCache = new Map(); // 'category|deck' -> path | null

function extractFirstPendingImage(deckResponse) {
    const cards = Array.isArray(deckResponse)
        ? deckResponse
        : (deckResponse?.flashcards || []);
    if (!Array.isArray(cards) || cards.length === 0) return null;

    const card = cards.find((c) => !c.learned) || cards[0];
    const def = Array.isArray(card?.definitions) ? card.definitions[0] : null;
    const img = def?.imagePath || def?.image_path || null;
    return img ? imageRepository.normalizeToAvif(img) : null;
}

export function useDeckFirstImages(items, userEmail, courseDirection = 'es_en') {
    const [images, setImages] = useState({});
    const signature = items
        .map((item) => `${item?.category}|${item?.deckName}`)
        .join(',');

    useEffect(() => {
        if (!userEmail) return undefined;
        let cancelled = false;

        items.forEach((item) => {
            if (!item?.category || !item?.deckName) return;
            const key = `${item.category}|${item.deckName}`;

            if (firstImageCache.has(key)) {
                const cachedPath = firstImageCache.get(key);
                setImages((prev) => (prev[key] === cachedPath ? prev : { ...prev, [key]: cachedPath }));
                return;
            }

            flashcardPort
                .fetchDeckData(userEmail, item.category, item.deckName, courseDirection)
                .then((data) => {
                    const path = extractFirstPendingImage(data);
                    firstImageCache.set(key, path);
                    if (!cancelled) {
                        setImages((prev) => ({ ...prev, [key]: path }));
                    }
                })
                .catch(() => {
                    // No cachear el fallo: un error transitorio (backend ocupado)
                    // debe poder reintentarse en el siguiente render.
                });
        });

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature, userEmail, courseDirection]);

    return images;
}
