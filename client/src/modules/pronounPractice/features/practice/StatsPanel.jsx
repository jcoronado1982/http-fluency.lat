export default function StatsPanel({ score, combo, level, onLevelChange }) {
  return (
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
            onChange={(event) => onLevelChange(event.target.value)}
          >
            <option value="basic">basic</option>
            <option value="intermediate">intermediate</option>
            <option value="advanced">advanced</option>
          </select>
        </div>
      </div>
    </aside>
  );
}
