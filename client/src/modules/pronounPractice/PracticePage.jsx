import React, { useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useStorySession } from './hooks/useStorySession';
import EpisodeCompleteOverlay from './features/practice/EpisodeCompleteOverlay';
import Eli5Modal from './features/practice/Eli5Modal';
import HistorySidebar from './features/practice/HistorySidebar';
import PracticeErrorState from './features/practice/PracticeErrorState';
import PracticeLoadingState from './features/practice/PracticeLoadingState';
import StatsPanel from './features/practice/StatsPanel';
import StoryStage from './features/practice/StoryStage';
import './practice.css';

export default function PracticePage() {
  const { user } = useAuth();
  const inputRef = useRef(null);
  const userId = user?.email || 'user_demo_123';

  const session = useStorySession(userId);

  if (session.progressQuery.isLoading || session.screensQuery.isLoading) {
    return <PracticeLoadingState />;
  }

  if (
    session.progressQuery.isError
    || session.screensQuery.isError
    || !session.progress
    || !session.screens?.length
  ) {
    const detail =
      session.progressQuery.error?.message
      || session.screensQuery.error?.message
      || 'Datos de Pronoun Practice no disponibles.';

    return (
      <PracticeErrorState
        moduleDisabled={session.backendFeaturesQuery.data?.pronoun_practice === false}
        detail={detail}
      />
    );
  }

  if (session.isEpisodeCompleted) {
    return (
      <EpisodeCompleteOverlay
        score={session.score}
        hasNext={Boolean(session.nextEpisodeQuery.data?.next_episode_id)}
        onContinue={session.handleNextEpisode}
        onExit={() => window.history.back()}
      />
    );
  }

  return (
    <div className="arcadeContainer">
      <HistorySidebar
        history={session.historyQuery.data}
        progress={session.progress}
        currentStep={session.currentStep}
        expandedEpisodes={session.expandedEpisodes}
        onToggleEpisode={session.toggleEpisode}
      />

      <StoryStage
        inputRef={inputRef}
        progress={session.progress}
        screens={session.screens}
        currentScreen={session.currentScreen}
        currentStep={session.currentStep}
        isShaking={session.isShaking}
        isSuccess={session.isSuccess}
        isRevealed={session.isRevealed}
        setIsRevealed={session.setIsRevealed}
        userInput={session.userInput}
        setUserInput={session.setUserInput}
        errorMsg={session.errorMsg}
        isAnalyzing={session.isAnalyzing}
        resolvedImageUrl={session.resolvedImageUrl}
        showStoryImage={session.showStoryImage}
        showImageLoader={session.showImageLoader}
        onImageError={() => session.setImageLoadError(true)}
        onSpeak={session.handleSpeak}
        onCheck={session.handleCheck}
        onEli5={session.handleEli5}
        onReset={session.handleReset}
        isResetPending={session.resetProgressMutation.isPending}
      />

      <StatsPanel
        score={session.score}
        combo={session.combo}
        level={session.level}
        onLevelChange={session.setLevel}
      />

      <Eli5Modal
        eli5Data={session.eli5Data}
        currentScreen={session.currentScreen}
        userInput={session.userInput}
        onClose={() => session.setEli5Data((prev) => ({ ...prev, show: false }))}
      />
    </div>
  );
}
