import { FiX } from 'react-icons/fi';

export default function Eli5Modal({
  eli5Data,
  currentScreen,
  userInput,
  onClose,
}) {
  if (!eli5Data.show) return null;

  return (
    <div className="eli5Overlay" onClick={onClose}>
      <div className="eli5Modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="closeEli5" onClick={onClose}>
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
  );
}
