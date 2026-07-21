import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { storyPort } from '../composition';

const storyQueryOptions = { retry: 1 };

/** Capa de aplicación React Query — orquesta puertos, no HTTP directo. */

export function useBackendFeatures() {
    return useQuery({
        queryKey: ['features'],
        queryFn: () => storyPort.fetchFeatures(),
        staleTime: 60_000,
    });
}

export function useStoryProgress(userId, storyId) {
    return useQuery({
        queryKey: ['pronoun-practice-progress', userId, storyId],
        queryFn: () => storyPort.fetchProgress(userId, storyId),
        enabled: Boolean(userId && storyId),
        ...storyQueryOptions,
    });
}

export function useEpisodeScreens(episodeId, options = {}) {
    return useQuery({
        queryKey: ['pronoun-practice-screens', episodeId],
        queryFn: () => storyPort.fetchEpisodeScreens(episodeId),
        enabled: Boolean(episodeId),
        ...storyQueryOptions,
        ...options,
    });
}

export function useUpdateProgress() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (updateData) => storyPort.updateProgress(updateData),
        onSuccess: (data) => {
            queryClient.setQueryData(
                ['pronoun-practice-progress', data.user_id, data.story_id],
                data,
            );
            queryClient.invalidateQueries({
                queryKey: ['pronoun-practice-screens', data.current_episode_id],
            });
            queryClient.invalidateQueries({
                queryKey: ['pronoun-practice-story-history', data.story_id],
            });
        },
    });
}

export function useNextEpisode(episodeId) {
    return useQuery({
        queryKey: ['pronoun-practice-next-episode', episodeId],
        queryFn: () => storyPort.fetchNextEpisode(episodeId),
        enabled: Boolean(episodeId),
    });
}

export function useStoryHistory(storyId) {
    return useQuery({
        queryKey: ['pronoun-practice-story-history', storyId],
        queryFn: () => storyPort.fetchStoryHistory(storyId),
        enabled: Boolean(storyId),
    });
}

export function useResetStoryProgress() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ userId, storyId }) => storyPort.resetProgress(userId, storyId),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['pronoun-practice-progress', variables.userId, variables.storyId],
            });
            queryClient.invalidateQueries({
                queryKey: ['pronoun-practice-story-history', variables.storyId],
            });
        },
    });
}
