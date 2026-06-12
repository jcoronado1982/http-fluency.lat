import React from 'react';
import styles from './Flashcard.module.css';
import HighlightedText from './HighlightedText';
import { FaSpinner } from 'react-icons/fa';
import { FiPlay, FiRefreshCw } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';

/**
 * DefinitionList — responsable ÚNICAMENTE de renderizar la lista de ejemplos de uso.
 * SRP: no maneja estado de imagen ni lógica de formas verbales.
 */
function DefinitionList({ definitions, blurredState, toggleBlur, playDefinitionMedia, deleteAudio, activeAudioText, highlightedWordIndex, isDisabled, isGeneratingAudio, currentLanguage }) {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const handleRotateVoice = (e, text, lang = 'en') => {
        e.stopPropagation();
        deleteAudio(text, lang);
    };

    return (
        <div className={styles.allExamplesContainer}>
            <ul>
                {definitions?.map((def, di) => (
                    <li key={di}>
                        <button
                            className={isGeneratingAudio && activeAudioText === (currentLanguage === 'es' ? def.usage_example_es : def.usage_example) ? styles.loadingAudioBtn : ''}
                            onClick={(e) => { e.stopPropagation(); playDefinitionMedia(di, currentLanguage === 'es' ? def.usage_example_es : def.usage_example, currentLanguage); }}
                            disabled={isDisabled}
                        >
                            {isGeneratingAudio && activeAudioText === (currentLanguage === 'es' ? def.usage_example_es : def.usage_example)
                                ? <FaSpinner className={styles.spinner} />
                                : <FiPlay size={14} />}
                        </button>

                        <div
                            className={`${styles.phraseContainer} ${blurredState[di] ? styles.blurredText : ''}`}
                            onClick={(e) => { e.stopPropagation(); toggleBlur(di); }}
                        >
                            <div className={styles.phraseText}>
                                <HighlightedText
                                    text={currentLanguage === 'es' ? def.usage_example_es : def.usage_example}
                                    activeAudioText={activeAudioText}
                                    highlightedWordIndex={highlightedWordIndex}
                                />
                                {isAdmin && (
                                    <button
                                        className={styles.rotateVoiceBtn}
                                        onClick={(e) => handleRotateVoice(e, currentLanguage === 'es' ? def.usage_example_es : def.usage_example, currentLanguage)}
                                        title="Actualizar voz aleatoria"
                                        disabled={isDisabled}
                                    >
                                            <FiRefreshCw size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {currentLanguage !== 'es' && def.pronunciation_guide_es && (
                            <span className={styles.customTooltip}>{def.pronunciation_guide_es}</span>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default DefinitionList;
