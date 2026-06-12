import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  FiChevronLeft, FiChevronRight, FiRefreshCw, FiCheck, FiPlay,
  FiBookOpen, FiClock, FiChevronDown, FiChevronUp, FiCpu, FiHelpCircle, FiX
} from 'react-icons/fi';
import './PronounPractice.css';

// Zustand & TanStack Query imports
import { useAuth } from '../context/AuthContext';
import { useGameStore } from '../store/useGameStore';
import {
  useStoryProgress, useEpisodeScreens, useUpdateProgress,
  useNextEpisode, useStoryHistory, useResetStoryProgress
} from '../api/storyApi';
import { API_URL, AI_ENABLED } from '../config/api';
import { tutorRepository } from '../repositories/tutorRepository';

const resolveStoryImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('/card_images/')) return url;
  const match = url.match(/card_images\/(.+)$/);
  if (match) {
    const path = match[1].replace(/\.(png|jpg|jpeg)$/i, '.avif');
    return `/card_images/${path}`;
  }
  return url;
};

const isPlaceholderImageUrl = (url) => {
  if (!url) return true;
  return url.includes('unsplash.com');
};

export default function PronounPracticePage() {
  const { user } = useAuth();
  
  // Configuración de Identidad
  const userId = user?.email || 'user_demo_123';
  const storyId = 1;

  // 1. Zustand Store (Game Logic)
  const {
    score, combo, currentStep: zustandStep,
    addPerfectScore, failPenalty, useHintPenalty: applyHintPenalty, setInitialState
  } = useGameStore();

  // 2. TanStack Query (Data & Persistence)
  const queryClient = useQueryClient();
  const {
    data: progress,
    isLoading: loadingProgress,
    isError: progressError,
    error: progressQueryError,
  } = useStoryProgress(userId, storyId);
  const {
    data: screens,
    isLoading: loadingScreens,
    isError: screensError,
    error: screensQueryError,
  } = useEpisodeScreens(progress?.current_episode_id);
  const { data: nextEpisodeData } = useNextEpisode(progress?.current_episode_id);
  const { data: historyData } = useStoryHistory(storyId);
  const updateProgressMutation = useUpdateProgress();
  const resetProgressMutation = useResetStoryProgress();

  // 3. UI Local State
  const [userInput, setUserInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [level, setLevel] = useState(() => localStorage.getItem('story_arcade_level') || 'intermediate');
  const [isEpisodeCompleted, setIsEpisodeCompleted] = useState(false);
  const [expandedEpisodes, setExpandedEpisodes] = useState({});
  const [eli5Data, setEli5Data] = useState({ show: false, text: '', loading: false });
  const [imageLoadError, setImageLoadError] = useState(false);

  const inputRef = useRef(null);
  const lastEpisodeIdRef = useRef(null);


  // 4. SSE Notifications (Real-time AI Image Updates) con prevención de fugas de memoria y estrategia de reconexión con Backoff Exponencial y Jitter (antithundering-herd)
  useEffect(() => {
    let isMounted = true; // Ref para saber si el componente sigue montado
    let eventSource = null;
    let reconnectTimeout = null;
    let retryCount = 0;
    const baseDelay = 1000; // 1 segundo
    const maxDelay = 30000; // 30 segundos máximo

    const connectSSE = () => {
      if (!isMounted) return;

      eventSource = new EventSource(`${API_URL}/api/notifications/events`);

      eventSource.onopen = () => {
        if (!isMounted) return;
        retryCount = 0; // Resetear intentos al conectar con éxito
      };

      eventSource.onmessage = (event) => {
        try {
          if (!isMounted) return; // Si el componente se desmontó, ignoramos la respuesta

          const data = JSON.parse(event.data);
          if (data.type === 'ping') return;
          if (data.type === 'SCREEN_UPDATED') {
            // Update the specific screen in the cache to avoid a full re-fetch
            queryClient.setQueryData(['screens', data.episode_id], (oldData) => {
              if (!oldData) return oldData;
              return oldData.map(screen => {
                if (screen.id === data.screen_id) {
                  return {
                    ...screen,
                    content: {
                      ...screen.content,
                      image_url: data.image_url
                    }
                  };
                }
                return screen;
              });
            });
          }
        } catch (err) {
          console.error('Error parsing SSE event:', err);
        }
      };

      eventSource.onerror = (err) => {
        if (!isMounted) return;

        console.warn('Conexión SSE perdida o interrumpida. Cerrando para reconexión con backoff.', err);
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }

        // Backoff exponencial con jitter (+/- 20%)
        const exponentialDelay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
        const jitter = (Math.random() * 0.4 - 0.2) * exponentialDelay; // +/- 20%
        const finalDelay = Math.max(1000, Math.round(exponentialDelay + jitter));

        retryCount++;

        reconnectTimeout = setTimeout(() => {
          connectSSE();
        }, finalDelay);
      };
    };

    connectSSE();

    return () => {
      isMounted = false;
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      // Limpiar síntesis de voz pendiente si el usuario cambia de página abruptamente
      window.speechSynthesis.cancel();
    };
  }, [queryClient]);

  // Persistence for level
  useEffect(() => {
    localStorage.setItem('story_arcade_level', level);
  }, [level]);

  // Sync DB Progress to Store on Load
  useEffect(() => {
    if (progress) {
      setInitialState(progress.total_score, 0, progress.current_step_order);
      // Persistir estado de completado si el backend dice que ya terminó
      if (progress.status === 'completed') {
        setIsEpisodeCompleted(true);
      }
      
      // Auto-expand switch: only if episode ID changed OR it's initial load
      if (progress.current_episode_id && progress.current_episode_id !== lastEpisodeIdRef.current) {
        setExpandedEpisodes({ [progress.current_episode_id]: true });
        lastEpisodeIdRef.current = progress.current_episode_id;
      }
    }
  }, [progress, setInitialState]);

  // Handle Level behavior
  useEffect(() => {
    setUserInput('');
    setErrorMsg('');
    setIsSuccess(false);
    setIsRevealed(level === 'basic');
  }, [zustandStep, level]);

  const currentScreen = screens?.[zustandStep - 1];
  const resolvedImageUrl = resolveStoryImageUrl(currentScreen?.content?.image_url);
  const showImageLoader = isPlaceholderImageUrl(currentScreen?.content?.image_url);
  const showStoryImage = resolvedImageUrl && !showImageLoader && !imageLoadError;

  useEffect(() => {
    setImageLoadError(false);
  }, [currentScreen?.id, resolvedImageUrl]);

  const handleSpeak = () => {
    if (!currentScreen) return;
    applyHintPenalty();
    const utterance = new SpeechSynthesisUtterance(currentScreen.content.correct_answer);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const callAITutor = async (input) => {
    if (!currentScreen) return;
    if (!AI_ENABLED) {
      setErrorMsg('⚡ Respuesta incorrecta. ¡Inténtalo de nuevo!');
      return;
    }
    setIsAnalyzing(true);
    setErrorMsg('👨‍🏫 Mi tutor está analizando tu frase...');
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
        const aiResult = typeof data.explanation === 'string' ? JSON.parse(data.explanation) : data;
        if (aiResult.is_correct) {
          handleSuccess();
        } else {
          setErrorMsg(aiResult.explanation);
        }
      } catch {
        setErrorMsg(data.explanation || '💡 Revisa la estructura de tu respuesta.');
      }
    } catch {
      setErrorMsg('⚡ Tip: Revisa la estructura de tu respuesta.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleEli5 = async () => {
    if (!currentScreen || isAnalyzing) return;
    setEli5Data({ show: true, text: '', loading: true });
    try {
      const data = await tutorRepository.explainLikeChild({
        userInput,
        correctAnswer: currentScreen.content.correct_answer,
        contextSpanish: currentScreen.content.challenge_text,
        originalExplanation: errorMsg,
      });
      setEli5Data(prev => ({ ...prev, text: data.explanation || "No recibí una explicación clara...", loading: false }));
    } catch (err) {
      console.error("Error fetching ELI5:", err);
      setEli5Data(prev => ({ ...prev, text: "¡Oh no! Mi varita mágica se ha quedado sin energía. Intenta de nuevo en un momento.", loading: false }));
    }
  };

  const handleSuccess = () => {
    setIsSuccess(true);
    addPerfectScore();
    setErrorMsg('');
    setIsRevealed(true);

    const nextStep = zustandStep + 1;
    const isLastStep = nextStep > screens.length;

    // Persistir en DB
    updateProgressMutation.mutate({
      user_id: userId,
      story_id: storyId,
      current_episode_id: progress.current_episode_id,
      current_step_order: isLastStep ? zustandStep : nextStep,
      score_increment: 500,
      status: isLastStep ? "completed" : "in_progress"
    });

    if (isLastStep) {
      setTimeout(() => setIsEpisodeCompleted(true), 1500);
    }
  };

  const handleCheck = () => {
    if (!currentScreen || isSuccess || isAnalyzing) return;
    const normalize = (str) => str.trim().toLowerCase().replace(/[.,!?;:]+$/, "");
    const input = normalize(userInput);
    const correct = normalize(currentScreen.content.correct_answer);

    setIsShaking(false);
    setIsSuccess(false);

    if (input === correct) {
      handleSuccess();
    } else {
      setIsShaking(true);
      failPenalty();
      callAITutor(userInput.trim());
    }
  };

  const handleNextEpisode = () => {
    if (!nextEpisodeData?.next_episode_id) {
      window.history.back();
      return;
    }

    updateProgressMutation.mutate({
      user_id: userId,
      story_id: storyId,
      current_episode_id: nextEpisodeData.next_episode_id,
      current_step_order: 1,
      score_increment: 0,
      status: "in_progress"
    }, {
      onSuccess: (newData) => {
        setIsEpisodeCompleted(false);
        setInitialState(newData.total_score, 0, 1);
        setUserInput('');
        setIsRevealed(level === 'basic');
      }
    });
  };
  
  const handleReset = () => {
    if (window.confirm("¿Estás seguro de que quieres reiniciar esta historia? Perderás todo tu progreso actual de este episodio.")) {
      resetProgressMutation.mutate({ userId, storyId }, {
        onSuccess: () => {
          setIsEpisodeCompleted(false);
          setUserInput('');
          setErrorMsg('');
          setIsSuccess(false);
          // Reload the page or rely on invalidation
          window.location.reload(); 
        }
      });
    }
  };

  if (loadingProgress || loadingScreens) {
    return <div className="arcadeContainer flex items-center justify-center">Loading pronoun practice mode...</div>;
  }

  if (progressError || screensError || !progress || !screens?.length) {
    const detail = progressQueryError?.message || screensQueryError?.message || 'Datos de Pronoun Practice no disponibles';
    return (
      <div className="arcadeContainer flex flex-col items-center justify-center gap-4 p-8 text-center">
        <h2 className="text-xl font-semibold text-slate-200">No se pudo cargar Pronoun Practice</h2>
        <p className="text-slate-400 max-w-lg">
          En producción la base SurrealDB no tiene episodios cargados o el API falló al responder.
          En local funciona porque tu SurrealDB ya tiene la historia sembrada.
        </p>
        <p className="text-sm text-red-300/80">{detail}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btnPrimary mt-2"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (isEpisodeCompleted) {
    const hasNext = !!nextEpisodeData?.next_episode_id;

    return (
      <div className="completionOverlay">
        <div className="completionCard">
          <h1 className="congratsTitle">EPISODE COMPLETE!</h1>
          <p className="congratsSub">Increíble trabajo. Has dominado este capítulo.</p>

          <div className="statsHighlightGrid">
            <div className="statBigItem">
              <span className="statBigLabel">PUNTUACIÓN TOTAL</span>
              <span className="statBigValue">{score}</span>
            </div>
            <div className="statBigItem">
              <span className="statBigLabel">ESTADO</span>
              <span className="statBigValue" style={{ color: '#69db7c', fontSize: '1.2em' }}>COMPLETADO</span>
            </div>
          </div>

          <div className="completionActions">
            <button
              onClick={handleNextEpisode}
              disabled={updateProgressMutation.isPending}
              className="btnPrimary"
            >
              {hasNext ? (
                <>
                  <FiPlay /> CONTINUAR AL SIGUIENTE
                </>
              ) : (
                'VOLVER AL INICIO'
              )}
            </button>
            <button
              onClick={() => window.history.back()}
              className="btnSecondary"
            >
              SALIR AL MENÚ
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="arcadeContainer">
      <aside className="historySidebar">
        <h3 className="historyTitle"><FiClock /> Historia</h3>

        <div className="historyList">
          <div className="episodesHistory">
            {(() => {
              // 1. Identificar el número del episodio actual para ocultar los futuros
              const currentEpisode = historyData?.find(ep => ep.id === progress?.current_episode_id);
              const currentEpNum = currentEpisode?.episode_number || 0;

              return historyData
                ?.filter(ep => ep.episode_number <= currentEpNum) // Filtrar episodios que aún no se alcanzan
                .map((ep) => {
                  const isCurrent = ep.id === progress?.current_episode_id;

                  // 2. Si es el episodio actual, solo mostrar los pasos (< zustandStep) que ya el usuario superó
                  const screensToShow = isCurrent
                    ? ep.screens.filter(s => s.step_order < zustandStep)
                    : ep.screens;

                  return (
                    <div key={ep.id} className={`episodeHistoryItem ${expandedEpisodes[ep.id] ? 'expanded' : ''} ${isCurrent ? 'current' : ''}`}>
                      <header
                        className="episodeHistoryHeader"
                        onClick={() => setExpandedEpisodes(prev => ({ ...prev, [ep.id]: !prev[ep.id] }))}
                      >
                        <span className="epNum">{`EP ${ep.episode_number}`}</span>
                        <span className="epTitle">{ep.title}</span>
                        {expandedEpisodes[ep.id] ? <FiChevronUp /> : <FiChevronDown />}
                      </header>
                      {expandedEpisodes[ep.id] && (
                        <div className="episodeScreensList">
                          {screensToShow.length > 0 ? (
                            screensToShow.map((s, idx) => (
                              <div key={idx} className="historyItem compact">
                                <p className="historySpanish">"{s.content.narrative_en || s.content.narrative_context}"</p>
                                <p className="historyEnglish">{s.content.correct_answer}</p>
                              </div>
                            ))
                          ) : (
                            <div className="emptyEpisodeProgress">El progreso aparecerá aquí...</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
            })()}
          </div>
        </div>
      </aside>

      <main className="mainStage">
        <header className="storyHeader">
          <div className="storyTitleContainer">
            <h1 className="storyTitle">{progress?.story_title || 'El Proyecto Legacy'}</h1>
            <div className="episodeBadge">
              <span className="episodeNumber">EPISODE {progress?.current_episode_id || 1}</span>
              <span className="episodeDivider">•</span>
              <span className="episodeName">{progress?.current_episode_title || 'Cargando...'}</span>
            </div>
          </div>
        </header>

        <div className={`arcadeCard ${isShaking ? 'shaking' : ''}`}>
          <div className="progressBarContainer">
            <div
              className="progressBarFill"
              style={{ width: `${(zustandStep / (screens?.length || 1)) * 100}%` }}
            ></div>
          </div>

          <div className="header">
            {isSuccess && <h2 className="scoreSuccess">EXCELLENT!</h2>}
          </div>

          <div className="contentZone">
            {currentScreen && (
              <div className="phraseContainer w-full flex flex-col gap-4">
                <div className="textCombinedContainer flex-1 flex flex-col gap-4">
                  <div className="narrativeBox bg-slate-800/40 p-5 rounded-2xl border-l-4 border-sky-500/50 w-full">
                    <p className="text-slate-400 italic m-0">
                      {currentScreen.content.narrative_context}
                    </p>
                  </div>

                  <div className="spanishTextWrapper w-full">
                    <p
                      className={`spanishText ${!isRevealed ? 'blurred' : ''}`}
                      onClick={() => setIsRevealed(true)}
                      style={{ margin: 0 }}
                    >
                      "{currentScreen.content.challenge_text}"
                    </p>
                    <button
                      onClick={handleSpeak}
                      className="audioBtnSmall flex-shrink-0"
                      title="Reproducir audio"
                    >
                      <FiPlay size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="inputWrapper">
              <textarea
                ref={inputRef}
                rows="2"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => (e.key === 'Enter' && !e.shiftKey) && (e.preventDefault(), handleCheck())}
                disabled={isSuccess || isAnalyzing}
                placeholder="Translate the bold text..."
                className={`arcadeInput ${isSuccess ? 'inputSuccess' : errorMsg ? 'inputError' : ''}`}
              />
              {errorMsg && (
                <div className="tutorFeedbackWrapper">
                  <div className={errorMsg.includes('⚡') ? "errorMsgBox" : "tutorMsgBox"}>
                    <p className={errorMsg.includes('⚡') ? "errorMsg" : "tutorMsg"}>{errorMsg}</p>
                    {errorMsg && !errorMsg.includes('⚡') && !isAnalyzing && !isSuccess && AI_ENABLED && (
                      <button className="eli5ToggleBtn" onClick={handleEli5} title="¿No entiendes la explicación? Pulsa aquí">
                        <FiHelpCircle size={16} />
                        <span>¿Más simple?</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="imagePlaceholder">
              {currentScreen && (
                showStoryImage ? (
                  <img
                    src={resolvedImageUrl}
                    alt="Story scene"
                    className="image"
                    style={{ opacity: isSuccess ? 1 : 0.8 }}
                    onError={() => setImageLoadError(true)}
                  />
                ) : showImageLoader || imageLoadError ? (
                  AI_ENABLED ? (
                    <div className="imageLoadingOverlay">
                      <div className="loaderVisualContainer">
                        <div className="aiLoaderCircle"></div>
                        <div className="aiLoaderCircleInner"></div>
                        <FiCpu className="aiLoaderIcon" />
                      </div>
                      <div className="aiLoaderTextContainer">
                        <h4 className="aiLoaderText">GENERANDO ESCENA</h4>
                        <span className="aiLoaderSubtext">FLUX.2 AI ENGINE • STAGE {zustandStep}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="noImagePlaceholder py-10 text-center text-slate-400">
                      {imageLoadError ? 'Generando escena...' : 'Imagen no disponible (IA desactivada)'}
                    </div>
                  )
                ) : null
              )}
            </div>
          </div>
        </div>

        <div className="controls">
          <button disabled className="controlBtn opacity-30"><FiChevronLeft size={30} /></button>
          <button onClick={handleReset} disabled={isAnalyzing || resetProgressMutation.isPending} className="controlBtn refreshBtn">
            <FiRefreshCw size={24} className={resetProgressMutation.isPending ? 'animate-spin' : ''} />
          </button>
          <div className="counter">
            <span className="counterLabel">STEP:</span>
            <span className="counterValue">{zustandStep} / {screens?.length || 1}</span>
          </div>
          <button onClick={handleCheck} disabled={isAnalyzing} className={`controlBtn checkBtn ${isSuccess ? 'checkBtnActive' : ''}`}><FiCheck size={32} strokeWidth={3} /></button>
          <button disabled className="controlBtn opacity-30"><FiChevronRight size={30} /></button>
        </div>
      </main>

      <aside className="rightPanel">
        <div className="rightPanelContent">
          <div className="statusGroup">
            <h3 className="historyTitle">Estadísticas</h3>
            <div className="sideScoreCard">
              <span className="sideScoreLabel">PUNTUACIÓN</span>
              <span className="sideScoreValue">{score}</span>
            </div>
            <div className="sideScoreCard mt-2">
              <span className="sideScoreLabel">COMBO</span>
              <span className="sideScoreValue">x{combo}</span>
            </div>
          </div>

          <div className="statusGroup mt-8">
            <h3 className="historyTitle">Configuración</h3>
            <div className="levelSelectorSide">
              <span className="levelLabel">Level:</span>
              <select className="levelSelect" value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="basic">basic</option>
                <option value="intermediate">intermediate</option>
                <option value="advanced">advanced</option>
              </select>
            </div>
          </div>
        </div>
      </aside>

      {/* Modal ELI5 (Explain Like I'm 5) */}
      {eli5Data.show && (
        <div className="eli5Overlay" onClick={() => setEli5Data({ ...eli5Data, show: false })}>
          <div className="eli5Modal" onClick={e => e.stopPropagation()}>
            <button className="closeEli5" onClick={() => setEli5Data({ ...eli5Data, show: false })}>
              <FiX />
            </button>
            <div className="eli5Header">
              <h3>Ayuda del Tutor</h3>
            </div>
            <div className="eli5Content">
              {eli5Data.loading ? (
                <div className="eli5Loader py-10">
                  <div className="loadingDots"><span></span><span></span><span></span></div>
                  <p className="text-slate-400 font-medium mt-4">Analizando para una explicación clara...</p>
                </div>
              ) : (
                <>
                  {currentScreen && (
                    <div className="eli5Reference">
                       <div>
                         <span>A TRADUCIR</span>
                         <p className="italic">"{currentScreen.content.challenge_text}"</p>
                       </div>
                       <div>
                         <span>TU RESPUESTA</span>
                         <p className="italic opacity-70">"{userInput}"</p>
                       </div>
                       <div>
                         <span>TRADUCCIÓN CORRECTA</span>
                         <p className="font-bold">"{currentScreen.content.correct_answer}"</p>
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