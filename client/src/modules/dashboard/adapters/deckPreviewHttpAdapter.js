/**
 * Adaptador HTTP de vista previa de mazos (infraestructura del dashboard).
 * Implementa `DeckPreviewPort` vía `httpClient` del shell.
 */
export function createDeckPreviewHttpAdapter(httpClient) {
    const normalizeCourseDirection = (courseDirection) => (
        courseDirection === 'en_es' ? 'en_es' : 'es_en'
    );

    return {
        fetchDeckData: (userId, category, deck, courseDirection = 'es_en') => {
            // Backend espera deck SIN extensión .json (ej. "1-basic/subject_pronouns")
            // porque lo construye internamente como "path/deck.json".
            const deckNameForBackend = deck.replace(/\.json$/i, '');
            return httpClient.get(
                `/api/flashcards-data?user_id=${encodeURIComponent(userId)}`
                + `&category=${encodeURIComponent(category)}`
                + `&deck=${encodeURIComponent(deckNameForBackend)}`
                + `&course_direction=${encodeURIComponent(normalizeCourseDirection(courseDirection))}`,
            );
        },

        // Los JSON antiguos apuntan a .jpg/.png pero los assets reales son AVIF.
        normalizeImagePath: (path) => {
            if (!path) return path;
            const cleanPath = path.split('?')[0];
            if (!cleanPath.includes('/card_images/')) return cleanPath;
            return cleanPath.replace(/\.(jpe?g|png|webp)$/i, '.avif');
        },
    };
}
