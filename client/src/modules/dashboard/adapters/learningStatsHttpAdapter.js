export function createLearningStatsHttpAdapter(httpClient) {
    const normalizeCourseDirection = (courseDirection) => (
        courseDirection === 'en_es' ? 'en_es' : 'es_en'
    );

    return {
        fetchLearningStats: (courseDirection = 'es_en') =>
            httpClient.get(`/api/learning-stats?course_direction=${encodeURIComponent(normalizeCourseDirection(courseDirection))}`),
        touchStudyDay: () => httpClient.post('/api/study/touch'),
    };
}
