import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { httpClient } from '../services/httpClient';

const storyQueryOptions = { retry: 1 };

export const useBackendFeatures = () => {
  return useQuery({
    queryKey: ['features'],
    queryFn: () => httpClient.get('/api/features'),
    staleTime: 60_000,
  });
};

export const useStoryProgress = (userId, storyId) => {
  return useQuery({
    queryKey: ['progress', userId, storyId],
    queryFn: () => httpClient.get(`/api/progress?user_id=${encodeURIComponent(userId)}&story_id=${storyId}`),
    enabled: !!userId && !!storyId,
    ...storyQueryOptions,
  });
};

export const useEpisodeScreens = (episodeId, options = {}) => {
  return useQuery({
    queryKey: ['screens', episodeId],
    queryFn: () => httpClient.get(`/api/episodes/${episodeId}/screens`),
    enabled: !!episodeId,
    ...storyQueryOptions,
    ...options
  });
};

export const useUpdateProgress = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (updateData) => httpClient.post('/api/progress/update', updateData),
    onSuccess: (data) => {
      queryClient.setQueryData(['progress', data.user_id, data.story_id], data);
      queryClient.invalidateQueries({ queryKey: ['screens', data.current_episode_id] });
    },
  });
};

export const useNextEpisode = (episodeId) => {
  return useQuery({
    queryKey: ['next-episode', episodeId],
    queryFn: () => httpClient.get(`/api/episodes/${episodeId}/next`),
    enabled: !!episodeId,
  });
};

export const useStoryHistory = (storyId) => {
  return useQuery({
    queryKey: ['story-history', storyId],
    queryFn: () => httpClient.get(`/api/stories/${storyId}/full-history`),
    enabled: !!storyId,
  });
};

export const useResetStoryProgress = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ userId, storyId }) =>
      httpClient.delete(`/api/progress/reset?user_id=${encodeURIComponent(userId)}&story_id=${storyId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['progress', variables.userId, variables.storyId] });
      queryClient.invalidateQueries({ queryKey: ['story-history', variables.storyId] });
    },
  });
};
