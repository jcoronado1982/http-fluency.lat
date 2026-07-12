import { useEffect, useState } from 'react';
import { deckPreviewPort } from '../composition';
import { extractFirstPendingImage } from '../useCases/deckPreview';

/**
 * Orquestación React: resuelve la primera imagen de cada mazo recomendado
 * igual que lo hace la página de flashcards — pide el deck
 * (`/api/flashcards-data`, que ya trae `learned` por usuario) vía el puerto
 * propio del módulo (`deckPreviewPort`) y delega la extracción al caso de
 * uso puro `extractFirstPendingImage`.
 *
 * ─── POR QUÉ EXISTE ESTE HOOK (historia del bug, Jul 2026) ─────────────────
 * Las recomendaciones del dashboard mostraban siempre la imagen estática de
 * categoría en vez de la primera imagen del mazo. Causas encadenadas:
 *
 * 1. `/api/learning-stats` (que trae `first_image_path` por deck) leía los
 *    ~256 JSONs de decks EN SERIE y tardaba 12-42s; el hook `useLearningStats`
 *    lo cortaba por timeout → `stats = null` → sin imágenes. (El backend
 *    ahora cachea el catálogo estático y paraleliza la carga en frío; ver
 *    `mod_flashcards/src/lib.rs`.)
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
 *
 * TTL de la caché (fix): el módulo de edición de tarjetas (borrar/regenerar
 * imagen) vive fuera de `dashboard` y no tiene forma de avisarle a este Map
 * que invalide una entrada. Sin TTL, una imagen regenerada en otra pantalla
 * quedaría "pegada" en el dashboard hasta un full reload. Con TTL corto el
 * Map se autolimpia solo, sin acoplar módulos ni sumar carga al backend
 * La caché es pequeña y solo cubre los decks recomendados visibles.
 * ───────────────────────────────────────────────────────────────────────────
 */
const FIRST_IMAGE_CACHE_TTL_MS = 2 * 60 * 1000;
const firstImageCache = new Map(); // 'category|deck' -> { path: string|null, cachedAt: number }

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

            const cached = firstImageCache.get(key);
            if (cached && Date.now() - cached.cachedAt < FIRST_IMAGE_CACHE_TTL_MS) {
                setImages((prev) => (prev[key] === cached.path ? prev : { ...prev, [key]: cached.path }));
                return;
            }

            deckPreviewPort
                .fetchDeckData(userEmail, item.category, item.deckName, courseDirection)
                .then((data) => {
                    const rawPath = extractFirstPendingImage(data);
                    const path = rawPath ? deckPreviewPort.normalizeImagePath(rawPath) : null;
                    firstImageCache.set(key, { path, cachedAt: Date.now() });
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
