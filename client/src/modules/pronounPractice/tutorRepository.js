import { httpClient } from '../../services/httpClient';

export const tutorRepository = {
  analyzeError: ({
    userInput,
    correctAnswer,
    contextSpanish,
    userId,
    storyId,
    screenId,
  }) =>
    httpClient.post('/api/analyze-error', {
      user_input: userInput,
      correct_answer: correctAnswer,
      context_spanish: contextSpanish,
      user_id: userId,
      story_id: storyId,
      screen_id: screenId,
    }),

  explainLikeChild: ({
    userInput,
    correctAnswer,
    contextSpanish,
    originalExplanation,
  }) =>
    httpClient.post('/api/explain-like-child', {
      user_input: userInput,
      correct_answer: correctAnswer,
      context_spanish: contextSpanish,
      original_explanation: originalExplanation,
    }),
};
