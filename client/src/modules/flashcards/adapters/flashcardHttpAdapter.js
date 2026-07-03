/**
 * Adaptador HTTP de flashcards (infraestructura).
 * Implementa el puerto `FlashcardPort` vía `httpClient`.
 */
export function createFlashcardHttpAdapter(httpClient) {
    return {
        fetchCategories: () =>
            httpClient.get('/api/categories'),

        fetchDecksForCategory: (category) =>
            httpClient.get(`/api/available-flashcards-files?category=${encodeURIComponent(category)}`),

        fetchDeckData: (userId, category, deck) =>
            httpClient.get(
                `/api/flashcards-data?user_id=${encodeURIComponent(userId)}&category=${encodeURIComponent(category)}&deck=${encodeURIComponent(deck)}`,
            ),

        updateCardStatus: (userId, category, deck, index, learned) =>
            httpClient.post('/api/update-status', { user_id: userId, category, deck, index, learned }),

        /**
         * Envía un lote de actualizaciones en una sola petición HTTP.
         * @param {string} userId
         * @param {string} category
         * @param {string} deck
         * @param {Array<{index: number, learned: boolean}>} cards
         */
        updateCardsBatch: (userId, category, deck, cards) =>
            httpClient.post('/api/update-batch', { user_id: userId, category, deck, cards }),

        resetDeckStatus: (userId, category, deck) =>
            httpClient.post('/api/reset-all', { user_id: userId, category, deck, confirm: true }),

        resetCategoryStatus: (userId, category, deck = '*') =>
            httpClient.post('/api/reset-all', { user_id: userId, category, deck, scope: 'category', confirm: true }),

        fetchLearningStats: () => httpClient.get('/api/learning-stats'),

        touchStudyDay: () => httpClient.post('/api/study/touch'),
    };
}
