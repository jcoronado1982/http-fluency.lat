/**
 * Adaptador HTTP de práctica guiada de pronombres.
 */
export function createStoryHttpAdapter(httpClient) {
    return {
        fetchFeatures: () => httpClient.get('/api/features'),

        fetchProgress: (userId, storyId) =>
            httpClient.get(
                `/api/progress?user_id=${encodeURIComponent(userId)}&story_id=${storyId}`,
            ),

        fetchEpisodeScreens: (episodeId) =>
            httpClient.get(`/api/episodes/${episodeId}/screens`),

        updateProgress: (updateData) =>
            httpClient.post('/api/progress/update', updateData),

        fetchNextEpisode: (episodeId) =>
            httpClient.get(`/api/episodes/${episodeId}/next`),

        fetchStoryHistory: (storyId) =>
            httpClient.get(`/api/stories/${storyId}/full-history`),

        resetProgress: (userId, storyId) =>
            httpClient.delete(
                `/api/progress/reset?user_id=${encodeURIComponent(userId)}&story_id=${storyId}`,
            ),
    };
}
