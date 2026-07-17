import React from 'react';
import PwaBottomDock from '../../../components/pwa/PwaBottomDock';
import nounsImage from '../../../assets/Nouns.png';
import verbsImage from '../../../assets/Verbs.png';
import adjectivesImage from '../../../assets/Adjectives.png';
import adverbsImage from '../../../assets/Adverb.png';
import prepositionsImage from '../../../assets/Preposition.png';
import pronounsImage from '../../../assets/Pronouns.png';
import connectorsImage from '../../../assets/Connectors.png';
import determinantImage from '../../../assets/Determinant.png';
import phrasalVerbsImage from '../../../assets/Phrasal Verbs.png';
import styles from './PwaStudyChrome.module.css';

const CATEGORY_IMAGES = {
    nouns: nounsImage,
    verbs: verbsImage,
    adjectives: adjectivesImage,
    adverbs: adverbsImage,
    preposition: prepositionsImage,
    pronouns: pronounsImage,
    connectors: connectorsImage,
    determinant: determinantImage,
    phrasal_verbs: phrasalVerbsImage,
};

const COPY = {
    es: {
        continue: 'Continuar estudiando',
        dashboard: 'Dashboard',
        studyLanguage: 'Idioma de estudio',
        categories: 'Categorías',
        english: 'Inglés',
        spanish: 'Español',
        open: 'ABRIR',
    },
    en: {
        continue: 'Continue studying',
        dashboard: 'Dashboard',
        studyLanguage: 'Study language',
        categories: 'Categories',
        english: 'English',
        spanish: 'Spanish',
        open: 'OPEN',
    },
};

/**
 * Chrome exclusivo de la sesión instalada como PWA.
 * CSS mantiene este bloque fuera del layout en navegador normal.
 */
export default function PwaStudyChrome({
    language = 'en',
    studyLanguage = 'en',
    onDashboard,
    onCatalog,
    onStudyLanguageChange,
    recommendations = [],
    onOpenRecommendation,
    hideShelf = false,
}) {
    const t = COPY[language] ?? COPY.en;
    return (
        <div className={styles.pwaOnly}>
            <section
                className={styles.continueSection}
                aria-labelledby="pwa-continue-title"
                hidden={hideShelf}
            >
                <h2 id="pwa-continue-title">{t.continue}</h2>
                <div className={styles.recommendationRail}>
                    {recommendations.map((item) => (
                        <button
                            key={`${item.category}-${item.deckName}`}
                            type="button"
                            className={styles.recommendationCard}
                            onClick={() => onOpenRecommendation?.(item)}
                        >
                            <span className={styles.recommendationCategory}>{item.categoryLabel}</span>
                            <span className={styles.recommendationImageWrap}>
                                <img
                                    src={item.firstImagePath || CATEGORY_IMAGES[item.category] || nounsImage}
                                    alt=""
                                    aria-hidden="true"
                                />
                                <span>{item.levelId}</span>
                            </span>
                            <strong>{item.deckLabel || item.deckName}</strong>
                            <span className={styles.recommendationAction}>{t.open}</span>
                        </button>
                    ))}
                </div>
            </section>

            <PwaBottomDock
                language={language}
                studyLanguage={studyLanguage}
                onDashboard={onDashboard}
                onCatalog={onCatalog}
                onStudyLanguageChange={onStudyLanguageChange}
            />
        </div>
    );
}
