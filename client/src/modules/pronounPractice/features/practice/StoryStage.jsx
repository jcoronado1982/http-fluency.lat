import { FiCheck, FiChevronLeft, FiChevronRight, FiCpu, FiHelpCircle, FiPlay, FiRefreshCw } from 'react-icons/fi';
import { AI_ENABLED } from '../../../../config/api';

export default function StoryStage({
  inputRef,
  progress,
  screens,
  currentScreen,
  currentStep,
  isShaking,
  isSuccess,
  isRevealed,
  setIsRevealed,
  userInput,
  setUserInput,
  errorMsg,
  isAnalyzing,
  resolvedImageUrl,
  showStoryImage,
  showImageLoader: _showImageLoader,
  onImageError,
  onSpeak,
  onCheck,
  onEli5,
  onReset,
  isResetPending,
}) {
  return (
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
                  onClick={onSpeak}
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
                      onCheck();
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
                        <button type="button" className="eli5ToggleBtn" onClick={onEli5}>
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
                    onError={onImageError}
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
          onClick={onReset}
          disabled={isResetPending}
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
          onClick={onCheck}
          disabled={isAnalyzing}
        >
          <FiCheck size={28} />
        </button>
        <button type="button" disabled className="controlBtn">
          <FiChevronRight size={26} />
        </button>
      </div>
    </main>
  );
}
