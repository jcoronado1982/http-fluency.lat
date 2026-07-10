import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import config from '../../../config';
import nounsImage from '../../../assets/Nouns.png';
import verbsImage from '../../../assets/Verbs.png';
import adjectivesImage from '../../../assets/Adjectives.png';
import adverbsImage from '../../../assets/Adverb.png';
import prepositionsImage from '../../../assets/Preposition.png';
import pronounsImage from '../../../assets/Pronouns.png';
import connectorsImage from '../../../assets/Connectors.png';
import determinantImage from '../../../assets/Determinant.png';
import phrasalVerbsImage from '../../../assets/Phrasal Verbs.png';
import { getModuleResumeSession, isDefaultHomeModule } from '../../index';
import { learningStatsPort } from '../composition';
import { useDeckFirstImages } from '../hooks/useDeckFirstImages';
import {
    computeDashboardLevelProgress,
    computeXp,
    estimateMinutesRemaining,
    formatCategoryLabel,
    getDashboardCarouselItems,
    getDashboardQuickAccessItems,
    getStreakMessage,
    getTimeGreeting,
} from '../useCases/dashboardProgress';
import CourseSessionCard from './CourseSessionCard';
import StatsSideStack from './StatsSideStack';
import LearningPathCard from './LearningPathCard';
import RecommendationsGrid from './RecommendationsGrid';

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

/**
 * DashboardHero — orquestador del panel principal: calcula datos (nivel, XP,
 * carrusel, imágenes de mazos) y compone las secciones presentacionales:
 * CourseSessionCard, StatsSideStack, LearningPathCard y RecommendationsGrid.
 */
export default function DashboardHero({ stats, statsLoading, labels, language, userName, userEmail, courseDirection }) {
    const navigate = useNavigate();
    const session = getModuleResumeSession(config);
    const flashcardPath = isDefaultHomeModule('flashcards', config) ? '/' : '/flashcard';

    const mastered = stats?.mastered_count ?? 0;
    const level = computeDashboardLevelProgress(stats, language);
    const locale = language === 'es' ? 'es' : 'en';
    const levelXpSpan = level.current.max - level.current.min;
    const xpInLevel = computeXp(level.wordsInLevel);
    const xpTarget = computeXp(levelXpSpan);
    const greeting = getTimeGreeting(language, userName);
    const streakMsg = stats ? getStreakMessage(stats, labels) : labels.streakStartShort;
    const quickAccessItems = useMemo(() => getDashboardQuickAccessItems({
        levelId: level.currentLevel,
        currentCategory: session?.category,
        language,
        limit: 4,
        stats,
    }), [language, level.currentLevel, session?.category, stats]);

    const carouselItems = useMemo(() => {
        const items = getDashboardCarouselItems({
            levelId: level.currentLevel,
            currentCategory: session?.category,
            currentSession: session,
            language,
            stats,
        });

        if (items.length === 0) {
            items.push({
                key: 'fallback-nouns',
                category: 'nouns',
                categoryLabel: formatCategoryLabel('nouns', language),
                deckName: labels.defaultDeck,
                resumeSession: null,
                cardsRemaining: 0,
                isCurrentGoal: true,
            });
        }

        return items;
    }, [language, labels.defaultDeck, level.currentLevel, session, stats]);
    const [activeSlide, setActiveSlide] = useState(0);

    const carouselSignature = carouselItems.map((item) => item.key).join('|');

    useEffect(() => {
        setActiveSlide(0);
    }, [carouselSignature]);

    const activeCourse = carouselItems[activeSlide] || carouselItems[0];
    const activeCategory = activeCourse?.category || 'nouns';
    const categoryLabel = activeCourse?.categoryLabel || formatCategoryLabel(activeCategory, language);

    /**
     * Imagen de cada recomendación (fix Jul 2026) — orden de resolución:
     *   1. `useDeckFirstImages` — lee el JSON del propio deck y devuelve la
     *      imagen de la primera tarjeta pendiente del usuario (fuente de
     *      verdad; igual que la página de estudio).
     *   2. `firstImagePath` de `stats.decks_progress` (backend learning-stats).
     *   3. PNG estático de la categoría (`CATEGORY_IMAGES`) como último recurso.
     * Si las imágenes vuelven a salir "predeterminadas", el detalle completo
     * del bug y sus trampas está documentado en `hooks/useDeckFirstImages.js`
     * y `hooks/useLearningStats.js` — leer eso antes de tocar nada.
     */
    const deckImages = useDeckFirstImages(
        activeCourse ? [...quickAccessItems, activeCourse] : quickAccessItems,
        userEmail,
        courseDirection,
    );
    const deckImageFor = (item) => (item ? deckImages[`${item.category}|${item.deckName}`] : null);

    const courseImage = deckImageFor(activeCourse)
        || activeCourse?.firstImagePath
        || CATEGORY_IMAGES[activeCategory]
        || nounsImage;
    const getItemImage = (item) => deckImageFor(item)
        || item.firstImagePath
        || item.first_image_path
        || CATEGORY_IMAGES[item.category]
        || nounsImage;
    const cardsRemaining = activeCourse?.cardsRemaining ?? 0;
    const minutesLeft = estimateMinutesRemaining(cardsRemaining);
    const canCycleCourses = carouselItems.length > 1;

    const openSession = (resumeSession = session) => {
        learningStatsPort.touchStudyDay().catch(() => {});
        if (resumeSession) {
            navigate(flashcardPath, { state: { resumeSession } });
        } else {
            navigate(flashcardPath);
        }
    };

    const cycleCourse = (direction) => {
        if (!canCycleCourses) return;
        setActiveSlide((current) => (current + direction + carouselItems.length) % carouselItems.length);
    };

    if (statsLoading) {
        return (
            <section className="dash-hero dash-hero--loading" aria-busy="true">
                <div className="dash-hero-shimmer" />
            </section>
        );
    }

    return (
        <section className="dash-hero">
            <header className="dash-hero-greeting">
                <h1>{greeting}</h1>
                <p>{labels.heroSubtitle}</p>
            </header>

            <div className="dash-top-grid">
                <CourseSessionCard
                    activeCourse={activeCourse}
                    carouselItems={carouselItems}
                    activeSlide={activeSlide}
                    canCycleCourses={canCycleCourses}
                    onCycle={cycleCourse}
                    categoryLabel={categoryLabel}
                    courseImage={courseImage}
                    cardsRemaining={cardsRemaining}
                    minutesLeft={minutesLeft}
                    progressPercent={level.levelPercent}
                    labels={labels}
                    language={language}
                    onOpen={() => openSession(activeCourse?.resumeSession)}
                />

                <StatsSideStack
                    level={level}
                    labels={labels}
                    locale={locale}
                    xpInLevel={xpInLevel}
                    xpTarget={xpTarget}
                    streakMsg={streakMsg}
                />
            </div>

            <LearningPathCard
                level={level}
                mastered={mastered}
                labels={labels}
                streakMsg={streakMsg}
            />

            <RecommendationsGrid
                items={quickAccessItems}
                getItemImage={getItemImage}
                labels={labels}
                onOpenItem={(item) => openSession({
                    category: item.category,
                    deck: item.deckName,
                })}
            />
        </section>
    );
}
