import { httpClient } from '../services/httpClient';

/**
 * Adapter for AI tutor API calls.
 * Centralises all calls to /api/analyze-error and /api/explain-like-child.
 */
export const tutorRepository = {
    /**
     * Sends a user answer for AI analysis.
     * @returns {{ is_correct: boolean, explanation: string, error_code?: string }}
     */
    analyzeError: ({ userInput, correctAnswer, contextSpanish, userId, storyId, screenId }) =>
        httpClient.post('/api/analyze-error', {
            user_input: userInput,
            correct_answer: correctAnswer,
            context_spanish: contextSpanish,
            user_id: userId,
            story_id: storyId,
            screen_id: screenId,
        }),

    /**
     * Requests a child-friendly explanation of the correct answer.
     * @returns {{ explanation: string }}
     */
    explainLikeChild: ({ userInput, correctAnswer, contextSpanish, originalExplanation }) =>
        httpClient.post('/api/explain-like-child', {
            user_input: userInput,
            correct_answer: correctAnswer,
            context_spanish: contextSpanish,
            original_explanation: originalExplanation,
        }),
};
