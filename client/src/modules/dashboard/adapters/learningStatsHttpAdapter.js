export function createLearningStatsHttpAdapter(httpClient) {
    return {
        fetchLearningStats: () => httpClient.get('/api/learning-stats'),
        touchStudyDay: () => httpClient.post('/api/study/touch'),
    };
}
