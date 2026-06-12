import React from 'react';
import styles from './Flashcard.module.css';
import { FaSpinner } from 'react-icons/fa';
import { FiPlay } from 'react-icons/fi';

/**
 * ConjugationTable — responsable ÚNICAMENTE de renderizar la tabla v1/v2/v3.
 * SRP: no maneja estado de imagen ni audio global.
 */
function ConjugationTable({ cardData, activeForm, setActiveForm, playAudio, activeAudioText, isGeneratingAudio }) {
    if (!cardData.irregular) return null;

    const forms = [
        { key: 'v1', form: cardData.name, phonetic: cardData.phonetic },
        { key: 'v2', form: cardData.irregular.past?.form, phonetic: cardData.irregular.past?.phonetic },
        { key: 'v3', form: cardData.irregular.participle?.form, phonetic: cardData.irregular.participle?.phonetic },
    ];

    return (
        <div className={styles.conjugationTable}>
            {forms.map(({ key, form, phonetic }) => (
                <div
                    key={key}
                    className={`${styles.conjugationItem} ${activeForm === key ? styles.activeConjugation : ''}`}
                    onClick={(e) => { e.stopPropagation(); setActiveForm(key); }}
                >
                    <div className={styles.conjugationHeader}>
                        <span className={styles.conjugationForm}>{form}</span>
                        <button
                            className={`${styles.conjugationAudioBtn} ${isGeneratingAudio && activeAudioText === form ? styles.loadingAudioBtn : ''}`}
                            onClick={(e) => { e.stopPropagation(); playAudio(form); }}
                            disabled={isGeneratingAudio}
                        >
                            {isGeneratingAudio && activeAudioText === form
                                ? <FaSpinner className={styles.spinner} />
                                : <FiPlay size={10} />}
                        </button>
                    </div>
                    <span className={styles.conjugationPhonetic}>{phonetic}</span>
                </div>
            ))}
        </div>
    );
}

export default ConjugationTable;
