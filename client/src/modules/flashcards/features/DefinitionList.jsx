import { getAudioLang, getStudyExampleText, isLearningEnglish } from './cardLanguageUtils';
import styles from './Flashcard.module.css';
import HighlightedText from './HighlightedText';
import { FaSpinner } from 'react-icons/fa';
import { FiPlay, FiRefreshCw } from 'react-icons/fi';
import { useAuth } from '../../../context/AuthContext';

/**
 * DefinitionList — responsable ÚNICAMENTE de renderizar la lista de ejemplos de uso.
 * SRP: no maneja estado de imagen ni lógica de formas verbales.
 */
function DefinitionList({ definitions, blurredState, toggleBlur, playDefinitionMedia, deleteAudio, activeAudioText, highlightedWordIndex, isDisabled, isGeneratingAudio, currentLanguage }) {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const handleRotateVoice = (e, text, lang = getAudioLang(currentLanguage)) => {
        e.stopPropagation();
        deleteAudio(text, lang);
    };

    return (
        <div className={styles.allExamplesContainer}>
            <ul>
                {definitions?.map((def, di) => {
                    const exampleText = getStudyExampleText(def, currentLanguage);
                    return (
                    <li key={di} className={styles.exampleRow}>
                        <button
                            type="button"
                            className={`${styles.examplePlayBtn} ${isGeneratingAudio && activeAudioText === exampleText ? styles.loadingAudioBtn : ''}`}
                            onClick={(e) => { e.stopPropagation(); playDefinitionMedia(di, exampleText, getAudioLang(currentLanguage)); }}
                            disabled={isDisabled}
                        >
                            {isGeneratingAudio && activeAudioText === exampleText
                                ? <FaSpinner className={styles.spinner} />
                                : <FiPlay size={18} />}
                        </button>

                        <div
                            className={`${styles.phraseContainer} ${blurredState[di] ? styles.blurredText : ''}`}
                            onClick={(e) => { e.stopPropagation(); toggleBlur(di); }}
                        >
                            <HighlightedText
                                text={exampleText}
                                activeAudioText={activeAudioText}
                                highlightedWordIndex={highlightedWordIndex}
                            />
                        </div>

                        {isAdmin && !(isGeneratingAudio && activeAudioText === exampleText) && (
                            <button
                                type="button"
                                className={styles.rotateVoiceBtn}
                                onClick={(e) => handleRotateVoice(e, exampleText, getAudioLang(currentLanguage))}
                                title="Actualizar voz aleatoria"
                                disabled={isDisabled}
                            >
                                <FiRefreshCw size={18} />
                            </button>
                        )}

                        {isLearningEnglish(currentLanguage) && def.pronunciation_guide_es && !blurredState[di] && (
                            <span className={styles.customTooltip}>{def.pronunciation_guide_es}</span>
                        )}
                    </li>
                    );
                })}
            </ul>
        </div>
    );
}

export default DefinitionList;
