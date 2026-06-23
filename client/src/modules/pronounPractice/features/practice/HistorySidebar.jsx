import { FiChevronDown, FiChevronUp, FiClock } from 'react-icons/fi';

export default function HistorySidebar({
  history,
  progress,
  currentStep,
  expandedEpisodes,
  onToggleEpisode,
}) {
  return (
    <aside className="historySidebar">
      <h3 className="historyTitle">
        <FiClock /> Historia
      </h3>
      <div className="historyList">
        {(history || [])
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
                  onClick={() => onToggleEpisode(episode.id)}
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
  );
}
