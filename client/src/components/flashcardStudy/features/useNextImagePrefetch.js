import { useEffect } from 'react';
import {
    hasPrefetchEntry,
    makePrefetchKey,
    setPrefetchedImagePath,
} from './imagePrefetchCache';

// Espera tras cambiar de tarjeta antes de prefetear: si el usuario avanza
// rápido, el cleanup del efecto cancela el timer y no se dispara ninguna
// petición — así una racha de "siguiente siguiente siguiente" no genera
// ráfagas contra el backend de 1 GB.
const PREFETCH_DELAY_MS = 600;

/**
 * Precarga en segundo plano la imagen de la SIGUIENTE tarjeta (def 0, forma
 * v1) para que al avanzar ya esté en la caché HTTP del navegador y la
 * resolución no pague el viaje a /api/resolve-image.
 *
 * Guardas de concurrencia/RAM (servidor de 1 GB, ~100 usuarios):
 * - una sola tarjeta por delante, una sola petición en vuelo;
 * - debounce de {@link PREFETCH_DELAY_MS}: navegar rápido cancela, no acumula;
 * - sin reintentos: un 404 se cachea como negativo y no se vuelve a pedir;
 * - no corre con la pestaña oculta;
 * - carga neta del servidor ~cero: el resolve on-view se ahorra vía caché.
 */
export function useNextImagePrefetch({ imagePort, card, category, deckName, enabled = true }) {
    const cardId = card?.id;
    const forceGeneration = Boolean(card?.force_generation);

    useEffect(() => {
        if (!enabled || !imagePort || !category || !deckName) return undefined;
        if (cardId === undefined || cardId === null || forceGeneration) return undefined;

        const key = makePrefetchKey({ category, deck: deckName, cardId, defIndex: 0, form: 'v1' });
        if (hasPrefetchEntry(key)) return undefined;

        let cancelled = false;
        const timer = setTimeout(async () => {
            if (cancelled || document.visibilityState === 'hidden') return;
            try {
                const data = await imagePort.resolve({
                    category,
                    deck: deckName,
                    index: cardId,
                    defIndex: 0,
                });
                if (cancelled || !data?.path) {
                    setPrefetchedImagePath(key, data?.path ?? null);
                    return;
                }
                setPrefetchedImagePath(key, data.path);
                // Calienta la caché HTTP con la MISMA URL que usará la vista
                // (normalizada, sin ?v=); los bytes quedan en el navegador.
                imagePort.preloadImage(data.path).catch(() => {});
            } catch {
                // 404 o red: negativo, sin reintentos.
                setPrefetchedImagePath(key, null);
            }
        }, PREFETCH_DELAY_MS);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [enabled, imagePort, category, deckName, cardId, forceGeneration]);
}
