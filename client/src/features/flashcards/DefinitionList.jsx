import React from 'react';
import styles from './Flashcard.module.css';
import HighlightedText from './HighlightedText';
import { FaTimes, FaSpinner } from 'react-icons/fa';
import { FiPlay } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';

/**
 * DefinitionList — responsable ÚNICAMENTE de renderizar la lista de ejemplos de uso.
 * SRP: no maneja estado de imagen ni lógica de formas verbales.
 */
function DefinitionList({ definitions, blurredState, toggleBlur, playDefinitionMedia, deleteAudio, activeAudioText, highlightedWordIndex, isDisabled, isGeneratingAudio }) {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const confirmDeleteAudio = (e, text) => {
        e.stopPropagation();
        if (window.confirm(`¿Borrar y regenerar audio de: "${text}"?`)) {
            deleteAudio(text);
        }
    };

    return (
        <div className={styles.allExamplesContainer}>
            <ul>
                {definitions?.map((def, di) => (
                    <li key={di}>
                        <button
                            className={isGeneratingAudio && activeAudioText === def.usage_example ? styles.loadingAudioBtn : ''}
                            onClick={(e) => { e.stopPropagation(); playDefinitionMedia(di, def.usage_example); }}
                            disabled={isDisabled}
                        >
                            {isGeneratingAudio && activeAudioText === def.usage_example
                                ? <FaSpinner className={styles.spinner} />
                                : <FiPlay size={14} />}
                        </button>

                        <div
                            className={`${styles.phraseContainer} ${blurredState[di] ? styles.blurredText : ''}`}
                            onClick={(e) => { e.stopPropagation(); toggleBlur(di); }}
                        >
                            <div className={styles.phraseText}>
                                <HighlightedText
                                    text={def.usage_example}
                                    activeAudioText={activeAudioText}
                                    highlightedWordIndex={highlightedWordIndex}
                                />
                            </div>
                            {isAdmin && (
                                <button
                                    className={styles.deleteAudioBtn}
                                    onClick={(e) => confirmDeleteAudio(e, def.usage_example)}
                                    title="Borrar y regenerar audio"
                                    disabled={isDisabled}
                                >
                                    <FaTimes size={10} />
                                </button>
                            )}
                        </div>

                        {def.pronunciation_guide_es && (
                            <span className={styles.customTooltip}>{def.pronunciation_guide_es}</span>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default DefinitionList;
