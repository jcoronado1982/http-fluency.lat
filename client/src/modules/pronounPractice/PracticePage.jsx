import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  FiCheck,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiChevronUp,
  FiClock,
  FiCpu,
  FiHelpCircle,
  FiPlay,
  FiRefreshCw,
  FiX,
} from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { AI_ENABLED, API_URL } from '../../config/api';
import {
  useBackendFeatures,
  useEpisodeScreens,
  useNextEpisode,
  useResetStoryProgress,
  useStoryHistory,
  useStoryProgress,
  useUpdateProgress,
} from './api';
import { usePronounPracticeStore } from './store';
import { tutorRepository } from './tutorRepository';
import './practice.css';

const STORY_ID = 1;
const LEVEL_STORAGE_KEY = 'pronoun_practice_level';

function resolveStoryImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('/card_images/')) return url;
  const match = url.match(/card_images\/(.+)$/);
  if (!match) return url;
  return `/card_images/${match[1].replace(/\.(png|jpg|jpeg)$/i, '.avif')}`;
}

function isPlaceholderImageUrl(url) {
  return !url || url.includes('unsplash.com');
}

function normalizeAnswer(value) {
  return value.trim().toLowerCase().replace(/[.,!?;:]+$/, '');
}

export default function PracticePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const lastEpisodeIdRef = useRef(null);

  const userId = user?.email || 'user_demo_123';
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

  useEffect(() => {
    let isMounted = true;
    let eventSource = null;
    let reconnectTimeout = null;
    let retryCount = 0;

    const connectSse = () => {
      if (!isMounted) return;

      eventSource = new EventSource(`${API_URL}/api/notifications/events`);

      eventSource.onopen = () => {
        retryCount = 0;
      };

      eventSource.onmessage = (event) => {
        if (!isMounted) return;

        try {
          const data = JSON.parse(event.data);
          if (data.type !== 'SCREEN_UPDATED') return;

          queryClient.setQueryData(
            ['pronoun-practice-screens', data.episode_id],
            (oldData) => {
              if (!oldData) return oldData;
              return oldData.map((screen) =>
                screen.id === data.screen_id
                  ? {
                      ...screen,
                      content: {
                        ...screen.content,
                        image_url: data.image_url,
                      },
                    }
                  : screen,
              );
            },
          );
        } catch (err) {
          console.error('Error parsing SSE event', err);
        }
      };

      eventSource.onerror = () => {
        if (!isMounted) return;
        eventSource?.close();

        const delay = Math.min(1000 * 2 ** retryCount, 30_000);
        retryCount += 1;
        reconnectTimeout = setTimeout(connectSse, delay);
      };
    };

    connectSse();

    return () => {
      isMounted = false;
      eventSource?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      window.speechSynthesis.cancel();
    };
  }, [queryClient]);

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
      const data = await tutorRepository.analyzeError({
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
      const data = await tutorRepository.explainLikeChild({
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

  if (progressQuery.isLoading || screensQuery.isLoading) {
    return (
      <div className="arcadeStatePanel">
        <p className="arcadeStateLoading">Cargando Pronoun Practice...</p>
      </div>
    );
  }

  if (progressQuery.isError || screensQuery.isError || !progress || !screens?.length) {
    const detail =
      progressQuery.error?.message ||
      screensQuery.error?.message ||
      'Datos de Pronoun Practice no disponibles.';
    const moduleDisabled = backendFeaturesQuery.data?.pronoun_practice === false;

    return (
      <div className="arcadeStatePanel">
        <h2 className="arcadeStateTitle">No se pudo cargar Pronoun Practice</h2>
        <p className="arcadeStateMessage">
          {moduleDisabled
            ? 'El backend actual no tiene el modulo pronoun_practice habilitado.'
            : 'La historia o sus episodios no estan disponibles en esta instancia.'}
        </p>
        <p className="arcadeStateDetail">{detail}</p>
        <button type="button" className="btnPrimary" onClick={() => window.location.reload()}>
          Reintentar
        </button>
      </div>
    );
  }

  if (isEpisodeCompleted) {
    const hasNext = Boolean(nextEpisodeQuery.data?.next_episode_id);

    return (
      <div className="completionOverlay">
        <div className="completionCard">
          <h1 className="congratsTitle">Episode Complete</h1>
          <p className="congratsSub">Buen trabajo. Terminaste este episodio.</p>
          <div className="statsHighlightGrid">
            <div className="statBigItem">
              <span className="statBigLabel">Puntuacion total</span>
              <span className="statBigValue">{score}</span>
            </div>
            <div className="statBigItem">
              <span className="statBigLabel">Estado</span>
              <span className="statBigValue statSuccess">Completado</span>
            </div>
          </div>
          <div className="completionActions">
            <button className="btnPrimary" onClick={handleNextEpisode}>
              {hasNext ? 'Continuar' : 'Volver'}
            </button>
            <button className="btnSecondary" onClick={() => window.history.back()}>
              Salir
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="arcadeContainer">
      <aside className="historySidebar">
        <h3 className="historyTitle">
          <FiClock /> Historia
        </h3>
        <div className="historyList">
          {(historyQuery.data || [])
            .filter((episode) => episode.episode_number <= (progress.current_episode_id || 1))
            .map((episode) => {
              const isCurrent = episode.id === progress.current_episode_id;
              const screensToShow = isCurrent
                ? episode.screens.filter((screen) => screen.step_order < currentStep)
                : episode.screens;

              return (
                <div
                  key={episode.id}
                  className={`episodeHistoryItem ${expandedEpisodes[episode.id] ? 'expanded' : ''} ${isCurrent ? 'current' : ''}`}
                >
                  <button
                    type="button"
                    className="episodeHistoryHeader"
                    onClick={() =>
                      setExpandedEpisodes((prev) => ({
                        ...prev,
                        [episode.id]: !prev[episode.id],
                      }))
                    }
                  >
                    <span className="epNum">{`EP ${episode.episode_number}`}</span>
                    <span className="epTitle">{episode.title}</span>
                    {expandedEpisodes[episode.id] ? <FiChevronUp /> : <FiChevronDown />}
                  </button>
                  {expandedEpisodes[episode.id] && (
                    <div className="episodeScreensList">
                      {screensToShow.length ? (
                        screensToShow.map((screen) => (
                          <div key={screen.id} className="historyItem">
                            <p className="historySpanish">
                              "{screen.content.narrative_en || screen.content.narrative_context}"
                            </p>
                            <p className="historyEnglish">
                              {screen.content.correct_answer}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="emptyEpisodeProgress">
                          El progreso aparecera aqui...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </aside>

      <main className="mainStage">
        <header className="storyHeader">
          <h1 className="storyTitle">{progress.story_title || 'Pronoun Practice'}</h1>
          <div className="episodeBadge">
            <span className="episodeNumber">{`Episode ${progress.current_episode_id || 1}`}</span>
            <span className="episodeDivider">•</span>
            <span className="episodeName">{progress.current_episode_title || '...'}</span>
          </div>
        </header>

        <div className={`arcadeCard ${isShaking ? 'shaking' : ''}`}>
          <div className="progressBarContainer">
            <div
              className="progressBarFill"
              style={{ width: `${(currentStep / (screens.length || 1)) * 100}%` }}
            />
          </div>

          <div className="contentZone">
            {isSuccess && <h2 className="scoreSuccess">Excellent</h2>}

            {currentScreen && (
              <>
                <div className="narrativeBox">
                  <p>{currentScreen.content.narrative_context}</p>
                </div>

                <div className="spanishTextWrapper">
                  <p
                    className={`spanishText ${!isRevealed ? 'blurred' : ''}`}
                    onClick={() => setIsRevealed(true)}
                  >
                    "{currentScreen.content.challenge_text}"
                  </p>
                  <button
                    type="button"
                    className="audioBtnSmall"
                    title="Reproducir audio"
                    onClick={handleSpeak}
                  >
                    <FiPlay size={16} />
                  </button>
                </div>

                <div className="inputWrapper">
                  <textarea
                    ref={inputRef}
                    rows="2"
                    className={`arcadeInput ${isSuccess ? 'inputSuccess' : ''} ${errorMsg ? 'inputError' : ''}`}
                    placeholder="Translate the bold text..."
                    value={userInput}
                    onChange={(event) => setUserInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        handleCheck();
                      }
                    }}
                    disabled={isSuccess || isAnalyzing}
                  />

                  {errorMsg && (
                    <div className="tutorFeedbackWrapper">
                      <div className={errorMsg.includes('incorrecta') ? 'errorMsgBox' : 'tutorMsgBox'}>
                        <p className={errorMsg.includes('incorrecta') ? 'errorMsg' : 'tutorMsg'}>
                          {errorMsg}
                        </p>
                        {!isAnalyzing && AI_ENABLED && !isSuccess && (
                          <button type="button" className="eli5ToggleBtn" onClick={handleEli5}>
                            <FiHelpCircle size={16} />
                            <span>Mas simple</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="imagePlaceholder">
                  {showStoryImage ? (
                    <img
                      src={resolvedImageUrl}
                      alt="Story scene"
                      className="image"
                      onError={() => setImageLoadError(true)}
                    />
                  ) : (
                    <div className="imageLoadingOverlay">
                      <div className="loaderVisualContainer">
                        <div className="aiLoaderCircle" />
                        <div className="aiLoaderCircleInner" />
                        <FiCpu className="aiLoaderIcon" />
                      </div>
                      <div className="aiLoaderTextContainer">
                        <h4 className="aiLoaderText">Generando escena</h4>
                        <span className="aiLoaderSubtext">Pronoun Practice</span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="controls">
          <button type="button" disabled className="controlBtn">
            <FiChevronLeft size={26} />
          </button>
          <button
            type="button"
            className="controlBtn refreshBtn"
            onClick={handleReset}
            disabled={resetProgressMutation.isPending}
          >
            <FiRefreshCw size={22} />
          </button>
          <div className="counter">
            <span className="counterLabel">Step</span>
            <span className="counterValue">
              {currentStep} / {screens.length}
            </span>
          </div>
          <button
            type="button"
            className={`controlBtn checkBtn ${isSuccess ? 'checkBtnActive' : ''}`}
            onClick={handleCheck}
            disabled={isAnalyzing}
          >
            <FiCheck size={28} />
          </button>
          <button type="button" disabled className="controlBtn">
            <FiChevronRight size={26} />
          </button>
        </div>
      </main>

      <aside className="rightPanel">
        <div className="statusGroup">
          <h3 className="historyTitle">Estadisticas</h3>
          <div className="sideScoreCard">
            <span className="sideScoreLabel">Puntuacion</span>
            <span className="sideScoreValue">{score}</span>
          </div>
          <div className="sideScoreCard">
            <span className="sideScoreLabel">Combo</span>
            <span className="sideScoreValue">x{combo}</span>
          </div>
        </div>

        <div className="statusGroup">
          <h3 className="historyTitle">Configuracion</h3>
          <div className="levelSelectorSide">
            <span className="levelLabel">Level</span>
            <select
              className="levelSelect"
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            >
              <option value="basic">basic</option>
              <option value="intermediate">intermediate</option>
              <option value="advanced">advanced</option>
            </select>
          </div>
        </div>
      </aside>

      {eli5Data.show && (
        <div className="eli5Overlay" onClick={() => setEli5Data((prev) => ({ ...prev, show: false }))}>
          <div className="eli5Modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="closeEli5"
              onClick={() => setEli5Data((prev) => ({ ...prev, show: false }))}
            >
              <FiX />
            </button>
            <div className="eli5Header">
              <h3>Ayuda del tutor</h3>
            </div>
            <div className="eli5Content">
              {eli5Data.loading ? (
                <p className="eli5Text">Preparando una explicacion mas clara...</p>
              ) : (
                <>
                  {currentScreen && (
                    <div className="eli5Reference">
                      <div>
                        <span>A traducir</span>
                        <p>"{currentScreen.content.challenge_text}"</p>
                      </div>
                      <div>
                        <span>Tu respuesta</span>
                        <p>"{userInput}"</p>
                      </div>
                      <div>
                        <span>Respuesta correcta</span>
                        <p>"{currentScreen.content.correct_answer}"</p>
                      </div>
                    </div>
                  )}
                  <p className="eli5Text">{eli5Data.text}</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
