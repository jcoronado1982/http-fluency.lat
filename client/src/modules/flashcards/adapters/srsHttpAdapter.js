export function createSrsHttpAdapter(httpClient) {
    const normalizeCourseDirection = (value) => (value === 'en_es' ? 'en_es' : 'es_en');
    return {
        fetchDueCards: (courseDirection = 'es_en') => httpClient.get(
            `/api/srs/due?course_direction=${encodeURIComponent(normalizeCourseDirection(courseDirection))}`,
        ),
    };
}
