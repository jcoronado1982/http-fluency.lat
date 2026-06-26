// src/features/flashcards/CardBack.jsx
import React from 'react';
import styles from './Flashcard.module.css';
import { getCardTitle } from './cardLanguageUtils';

function CardBack({ cardData, activeForm, currentLanguage }) {
    const getDisplayDefinitions = () => {
        if (activeForm === 'v1' || !cardData.irregular) {
            return {
                name: cardData.name,
                definitions: cardData.definitions || []
            };
        }
        if (activeForm === 'v2' && cardData.irregular?.past) {
            const past = cardData.irregular.past;
            const defs = Array.isArray(past.definitions) ? past.definitions : (past.usage_example ? [{
                usage_example: past.usage_example,
                usage_example_es: past.usage_example_es,
                meaning: past.meaning || `Pasado de ${cardData.name}`
            }] : []);
            return {
                name: past.form || cardData.name,
                definitions: defs
            };
        }
        if (activeForm === 'v3' && cardData.irregular?.participle) {
            const part = cardData.irregular.participle;
            const defs = Array.isArray(part.definitions) ? part.definitions : (part.usage_example ? [{
                usage_example: part.usage_example,
                usage_example_es: part.usage_example_es,
                meaning: part.meaning || `Participio de ${cardData.name}`
            }] : []);
            return {
                name: part.form || cardData.name,
                definitions: defs
            };
        }
        return { name: cardData.name, definitions: [] };
    };

    const displayData = getDisplayDefinitions();
    const title = getCardTitle(displayData, currentLanguage);

    return (
        <div className={styles.cardBack}>
            {displayData.definitions?.map((def, i) => (
                <div key={i} className={styles.definitionBlockBack}>
                    <p className={styles.meaningSentence}>
                        <span className={styles.phrasalVerbBack}>
                            {currentLanguage === 'es' ? displayData.name : title}
                        </span>{' '}
                        {currentLanguage === 'es' ? 'significa' : 'means'}{' '}
                        <strong className={styles.meaningBack}>
                            {currentLanguage === 'es' ? def.meaning : displayData.name}
                        </strong>
                    </p>
                    <p
                        className={styles.usageExampleEn}
                        dangerouslySetInnerHTML={{
                            __html: `"${(currentLanguage === 'es' ? def.usage_example : def.usage_example)
                                ?.replace(
                                    new RegExp(`\\b(${displayData.name.split(' / ')[0]})\\b`, 'gi'),
                                    '<strong>$1</strong>'
                                )}" `
                        }}
                    />
                    {def.alternative_example && currentLanguage !== 'es' && (
                        <p className={styles.alternativeExample}>
                            <em>Alternativa:</em> "{def.alternative_example}"
                        </p>
                    )}

                    {def.usage_example_es && (
                        <p className={styles.usageExampleEs}>
                            {def.usage_example_es}
                        </p>
                    )}
                </div>
            ))}
        </div>
    );
}

export default CardBack;
