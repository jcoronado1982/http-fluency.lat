export function createReviewSuggestionHttpAdapter(httpClient) {
    const normalizeCourseDirection = (value) => (value === 'en_es' ? 'en_es' : 'es_en');

    return {
        fetchDueCards: (courseDirection = 'es_en', limit = 5_000) => httpClient.get(
            `/api/srs/due?course_direction=${encodeURIComponent(normalizeCourseDirection(courseDirection))}&limit=${Math.min(5_000, Math.max(1, Math.trunc(limit)))}`,
        ),
    };
}
