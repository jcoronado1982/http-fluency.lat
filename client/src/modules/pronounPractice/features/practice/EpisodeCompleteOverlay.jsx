export default function EpisodeCompleteOverlay({ score, hasNext, onContinue, onExit }) {
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
          <button type="button" className="btnPrimary" onClick={onContinue}>
            {hasNext ? 'Continuar' : 'Volver'}
          </button>
          <button type="button" className="btnSecondary" onClick={onExit}>
            Salir
          </button>
        </div>
      </div>
    </div>
  );
}
