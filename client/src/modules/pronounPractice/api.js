import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { httpClient } from '../../services/httpClient';

const storyQueryOptions = { retry: 1 };

export function useBackendFeatures() {
  return useQuery({
    queryKey: ['features'],
    queryFn: () => httpClient.get('/api/features'),
    staleTime: 60_000,
  });
}

export function useStoryProgress(userId, storyId) {
  return useQuery({
    queryKey: ['pronoun-practice-progress', userId, storyId],
    queryFn: () =>
      httpClient.get(
        `/api/progress?user_id=${encodeURIComponent(userId)}&story_id=${storyId}`,
      ),
    enabled: Boolean(userId && storyId),
    ...storyQueryOptions,
  });
}

export function useEpisodeScreens(episodeId, options = {}) {
  return useQuery({
    queryKey: ['pronoun-practice-screens', episodeId],
    queryFn: () => httpClient.get(`/api/episodes/${episodeId}/screens`),
    enabled: Boolean(episodeId),
    ...storyQueryOptions,
    ...options,
  });
}

export function useUpdateProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updateData) => httpClient.post('/api/progress/update', updateData),
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
    queryFn: () => httpClient.get(`/api/episodes/${episodeId}/next`),
    enabled: Boolean(episodeId),
  });
}

export function useStoryHistory(storyId) {
  return useQuery({
    queryKey: ['pronoun-practice-story-history', storyId],
    queryFn: () => httpClient.get(`/api/stories/${storyId}/full-history`),
    enabled: Boolean(storyId),
  });
}

export function useResetStoryProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, storyId }) =>
      httpClient.delete(
        `/api/progress/reset?user_id=${encodeURIComponent(userId)}&story_id=${storyId}`,
      ),
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
