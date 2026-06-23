import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AI_ENABLED } from '../../../config/api';
import { tutorPort } from '../composition';
import {
  useBackendFeatures,
  useEpisodeScreens,
  useNextEpisode,
  useResetStoryProgress,
  useStoryHistory,
  useStoryProgress,
  useUpdateProgress,
} from '../queries/storyQueries';
import { usePronounPracticeStore } from '../store';
import { useStoryImageSse } from './useStoryImageSse';
import {
  LEVEL_STORAGE_KEY,
  STORY_ID,
  isPlaceholderImageUrl,
  normalizeAnswer,
  resolveStoryImageUrl,
} from '../useCases/practiceUtils';

export function useStorySession(userId) {
  const queryClient = useQueryClient();
  const lastEpisodeIdRef = useRef(null);
  const storyId = STORY_ID;

  const {
    score,
    combo,
    currentStep,
    addPerfectScore,
    failPenalty,
    useHintPenalty: applyHintPenalty,
    setInitialState,
    resetGame,
  } = usePronounPracticeStore();

  const [userInput, setUserInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isEpisodeCompleted, setIsEpisodeCompleted] = useState(false);
  const [expandedEpisodes, setExpandedEpisodes] = useState({});
  const [imageLoadError, setImageLoadError] = useState(false);
  const [level, setLevel] = useState(
    () => localStorage.getItem(LEVEL_STORAGE_KEY) || 'intermediate',
  );
  const [eli5Data, setEli5Data] = useState({
    show: false,
    loading: false,
    text: '',
  });

  const progressQuery = useStoryProgress(userId, storyId);
  const screensQuery = useEpisodeScreens(progressQuery.data?.current_episode_id);
  const nextEpisodeQuery = useNextEpisode(progressQuery.data?.current_episode_id);
  const historyQuery = useStoryHistory(storyId);
  const backendFeaturesQuery = useBackendFeatures();
  const updateProgressMutation = useUpdateProgress();
  const resetProgressMutation = useResetStoryProgress();

  useStoryImageSse(queryClient);

  const progress = progressQuery.data;
  const screens = screensQuery.data;
  const currentScreen = screens?.[currentStep - 1];
  const resolvedImageUrl = resolveStoryImageUrl(currentScreen?.content?.image_url);
  const showImageLoader = isPlaceholderImageUrl(currentScreen?.content?.image_url);
  const showStoryImage = resolvedImageUrl && !showImageLoader && !imageLoadError;

  useEffect(() => {
    localStorage.setItem(LEVEL_STORAGE_KEY, level);
  }, [level]);

  useEffect(() => {
    if (!progress) return;

    setInitialState(progress.total_score, 0, progress.current_step_order);
    setIsEpisodeCompleted(progress.status === 'completed');

    if (
      progress.current_episode_id &&
      progress.current_episode_id !== lastEpisodeIdRef.current
    ) {
      setExpandedEpisodes({ [progress.current_episode_id]: true });
      lastEpisodeIdRef.current = progress.current_episode_id;
    }
  }, [progress, setInitialState]);

  useEffect(() => {
    setUserInput('');
    setErrorMsg('');
    setIsSuccess(false);
    setIsRevealed(level === 'basic');
  }, [currentStep, level]);

  useEffect(() => {
    setImageLoadError(false);
  }, [currentScreen?.id, resolvedImageUrl]);

  function handleSpeak() {
    if (!currentScreen) return;
    applyHintPenalty();
    const utterance = new SpeechSynthesisUtterance(currentScreen.content.correct_answer);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  function handleSuccess() {
    if (!currentScreen || !progress || !screens) return;

    setIsSuccess(true);
    setErrorMsg('');
    setIsRevealed(true);
    addPerfectScore();

    const nextStep = currentStep + 1;
    const isLastStep = nextStep > screens.length;

    updateProgressMutation.mutate({
      user_id: userId,
      story_id: storyId,
      current_episode_id: progress.current_episode_id,
      current_step_order: isLastStep ? currentStep : nextStep,
      score_increment: 500,
      status: isLastStep ? 'completed' : 'in_progress',
    });

    if (isLastStep) {
      setTimeout(() => setIsEpisodeCompleted(true), 1200);
    }
  }

  async function callAiTutor(input) {
    if (!currentScreen) return;

    if (!AI_ENABLED) {
      setErrorMsg('Respuesta incorrecta. Intenta de nuevo.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg('El tutor esta analizando tu respuesta...');

    try {
      const data = await tutorPort.analyzeError({
        userInput: input,
        correctAnswer: currentScreen.content.correct_answer,
        contextSpanish: currentScreen.content.challenge_text,
        userId,
        storyId,
        screenId: currentScreen.id,
      });

      try {
        const aiResult =
          typeof data.explanation === 'string'
            ? JSON.parse(data.explanation)
            : data.explanation;

        if (aiResult.is_correct) {
          handleSuccess();
        } else {
          setErrorMsg(aiResult.explanation || 'Revisa la estructura de tu respuesta.');
        }
      } catch {
        setErrorMsg(data.explanation || 'Revisa la estructura de tu respuesta.');
      }
    } catch {
      setErrorMsg('No pude analizar la respuesta en este momento.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleEli5() {
    if (!currentScreen || isAnalyzing) return;

    setEli5Data({ show: true, loading: true, text: '' });

    try {
      const data = await tutorPort.explainLikeChild({
        userInput,
        correctAnswer: currentScreen.content.correct_answer,
        contextSpanish: currentScreen.content.challenge_text,
        originalExplanation: errorMsg,
      });

      setEli5Data({
        show: true,
        loading: false,
        text: data.explanation || 'No recibi una explicacion clara.',
      });
    } catch {
      setEli5Data({
        show: true,
        loading: false,
        text: 'No pude generar una explicacion mas simple ahora.',
      });
    }
  }

  function handleCheck() {
    if (!currentScreen || isSuccess || isAnalyzing) return;

    setIsShaking(false);
    setIsSuccess(false);

    const input = normalizeAnswer(userInput);
    const correct = normalizeAnswer(currentScreen.content.correct_answer);

    if (input === correct) {
      handleSuccess();
      return;
    }

    setIsShaking(true);
    failPenalty();
    callAiTutor(userInput.trim());
  }

  function handleNextEpisode() {
    const nextEpisodeId = nextEpisodeQuery.data?.next_episode_id;
    if (!nextEpisodeId) {
      window.history.back();
      return;
    }

    updateProgressMutation.mutate(
      {
        user_id: userId,
        story_id: storyId,
        current_episode_id: nextEpisodeId,
        current_step_order: 1,
        score_increment: 0,
        status: 'in_progress',
      },
      {
        onSuccess: (newData) => {
          setIsEpisodeCompleted(false);
          setInitialState(newData.total_score, 0, 1);
          setUserInput('');
          setErrorMsg('');
          setIsSuccess(false);
          setIsRevealed(level === 'basic');
        },
      },
    );
  }

  function handleReset() {
    const confirmed = window.confirm(
      'Se reiniciara el progreso de esta historia. Deseas continuar?',
    );
    if (!confirmed) return;

    resetProgressMutation.mutate(
      { userId, storyId },
      {
        onSuccess: () => {
          setIsEpisodeCompleted(false);
          setUserInput('');
          setErrorMsg('');
          setIsSuccess(false);
          resetGame();
          window.location.reload();
        },
      },
    );
  }

  function toggleEpisode(episodeId) {
    setExpandedEpisodes((prev) => ({
      ...prev,
      [episodeId]: !prev[episodeId],
    }));
  }

  return {
    progressQuery,
    screensQuery,
    historyQuery,
    backendFeaturesQuery,
    nextEpisodeQuery,
    resetProgressMutation,
    progress,
    screens,
    currentScreen,
    currentStep,
    score,
    combo,
    level,
    setLevel,
    userInput,
    setUserInput,
    errorMsg,
    isSuccess,
    isShaking,
    isRevealed,
    setIsRevealed,
    isAnalyzing,
    isEpisodeCompleted,
    expandedEpisodes,
    toggleEpisode,
    resolvedImageUrl,
    showStoryImage,
    showImageLoader,
    imageLoadError,
    setImageLoadError,
    eli5Data,
    setEli5Data,
    handleSpeak,
    handleCheck,
    handleEli5,
    handleNextEpisode,
    handleReset,
  };
}
