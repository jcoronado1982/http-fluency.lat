import React, { useEffect, useMemo, useState } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
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
import {
    computeDashboardLevelProgress,
    computeXp,
    estimateMinutesRemaining,
    formatCategoryLabel,
    getDashboardCarouselItems,
    getDashboardQuickAccessItems,
    getStreakMessage,
    getTimeGreeting,
    isLevelActive,
} from '../useCases/dashboardProgress';
import AnimatedNumber from './AnimatedNumber';

const RING = 156;
const STROKE = 12;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

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

function ProgressRing({ percent, labels, value, target, locale }) {
    const offset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;

    return (
        <div className="dash-main-ring-wrap">
            <svg className="dash-main-ring" width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} aria-hidden>
                <circle className="dash-main-ring-track" cx={RING / 2} cy={RING / 2} r={RADIUS} strokeWidth={STROKE} />
                <circle
                    className="dash-main-ring-fill"
                    cx={RING / 2}
                    cy={RING / 2}
                    r={RADIUS}
                    strokeWidth={STROKE}
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={offset}
                />
            </svg>
            <div className="dash-main-ring-copy">
                <strong><AnimatedNumber value={value} duration={900} /></strong>
                <small>/ {target.toLocaleString(locale)} {labels.xpLabel}</small>
                <span><AnimatedNumber value={percent} duration={900} />% {percent === 100 ? labels.ringComplete : labels.ringGoal}</span>
            </div>
        </div>
    );
}

function LevelIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 19V5M20 19V5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path
                d="M4 8h16M4 16h16M8 5v14M16 5v14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
        </svg>
    );
}

function WordsIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 8h8M5 12h6M5 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path
                d="M14 7h5v10h-5M17 7v10"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path d="M14 12h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

function StreakInlineIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
                d="M12.5 3.5c.8 3.5 4.6 4.8 4.6 9.1a5.1 5.1 0 0 1-10.2 0c0-2.7 1.6-4.8 3.2-6.4.2 2 1.2 3.1 2.4 3.8.6-1.4.7-3.4 0-6.5Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function levelCopy(step, labels) {
    if (step.premium) return labels.premiumLevelLabel;
    return labels.levelNames?.[step.id] || step.id;
}

export default function DashboardHero({ stats, statsLoading, labels, language, userName }) {
    const navigate = useNavigate();
    const session = getModuleResumeSession(config);
    const flashcardPath = isDefaultHomeModule('flashcards', config) ? '/' : '/flashcard';

    const mastered = stats?.mastered_count ?? 0;
    const streak = stats?.streak_days ?? 0;
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
    }), [language, level.currentLevel, session?.category]);
    const carouselItems = useMemo(() => {
        const items = getDashboardCarouselItems({
            levelId: level.currentLevel,
            currentCategory: session?.category,
            currentSession: session,
            language,
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
    }, [language, labels.defaultDeck, level.currentLevel, session]);
    const [activeSlide, setActiveSlide] = useState(0);

    const carouselSignature = carouselItems.map((item) => item.key).join('|');

    useEffect(() => {
        setActiveSlide(0);
    }, [carouselSignature]);

    const activeCourse = carouselItems[activeSlide] || carouselItems[0];
    const activeCategory = activeCourse?.category || 'nouns';
    const categoryLabel = activeCourse?.categoryLabel || formatCategoryLabel(activeCategory, language);
    const courseImage = CATEGORY_IMAGES[activeCategory] || nounsImage;
    const cardsRemaining = activeCourse?.cardsRemaining ?? 0;
    const minutesLeft = estimateMinutesRemaining(cardsRemaining);
    const canCycleCourses = carouselItems.length > 1;
    const previousCourseLabel = language === 'es' ? 'Categoría anterior' : 'Previous category';
    const nextCourseLabel = language === 'es' ? 'Siguiente categoría' : 'Next category';

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
                <article className="dash-course-card" style={{ '--dash-course-image': `url("${courseImage}")` }}>
                    <div className="dash-course-topbar">
                        <span className="dash-course-badge">
                            {activeCourse?.isCurrentGoal ? labels.currentGoal : categoryLabel}
                        </span>
                    </div>
                    {canCycleCourses && (
                        <>
                            <button
                                type="button"
                                className="dash-course-carousel-btn dash-course-carousel-btn--prev"
                                onClick={() => cycleCourse(-1)}
                                aria-label={previousCourseLabel}
                            >
                                <FiChevronLeft aria-hidden />
                            </button>
                            <button
                                type="button"
                                className="dash-course-carousel-btn dash-course-carousel-btn--next"
                                onClick={() => cycleCourse(1)}
                                aria-label={nextCourseLabel}
                            >
                                <FiChevronRight aria-hidden />
                            </button>
                            <div className="dash-course-carousel-dots" aria-hidden>
                                {carouselItems.map((item, index) => (
                                    <span
                                        key={item.key}
                                        className={`dash-course-carousel-dot ${index === activeSlide ? 'is-active' : ''}`}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                    <h2>{labels.courseTitle.replace('{category}', categoryLabel)}</h2>
                    <p>
                        {activeCourse?.resumeSession
                            ? labels.courseMeta
                                .replace('{category}', categoryLabel)
                                .replace('{deck}', activeCourse.deckLabel || activeCourse.deckName || labels.defaultDeck)
                            : labels.missionFallback}
                    </p>
                    {cardsRemaining > 0 && (
                        <span className="dash-course-progress-copy">
                            {labels.cardsRemaining.replace('{n}', String(cardsRemaining))}
                            {' · '}
                            {labels.minutesLeft.replace('{n}', String(minutesLeft))}
                        </span>
                    )}
                    <div className="dash-course-progress" aria-hidden="true">
                        <span style={{ width: `${level.levelPercent}%` }} />
                    </div>
                    <button
                        type="button"
                        className="dash-course-cta"
                        onClick={() => openSession(activeCourse?.resumeSession)}
                    >
                        {labels.continueButton}
                    </button>
                </article>

                <aside className="dash-side-stack">
                    <article className="dash-ring-card">
                        <ProgressRing
                            percent={level.levelPercent}
                            labels={labels}
                            value={xpInLevel}
                            target={xpTarget}
                            locale={locale}
                        />
                    </article>

                    <div className="dash-mini-stats">
                        <article className="dash-mini-stat dash-mini-stat--level">
                            <span className="dash-mini-stat-icon" aria-hidden>
                                <LevelIcon />
                            </span>
                            <div className="dash-mini-stat-copy">
                                <span className="dash-level-line">
                                    <strong>{level.currentLevel}</strong>
                                    <small>{labels.levelShort}</small>
                                </span>
                                <span className="dash-streak-line">
                                    <StreakInlineIcon />
                                    <small>{streakMsg}</small>
                                </span>
                            </div>
                        </article>
                        <article className="dash-mini-stat dash-mini-stat--words">
                            <span className="dash-mini-stat-icon" aria-hidden>
                                <WordsIcon />
                            </span>
                            <div className="dash-mini-stat-copy">
                                <strong>{level.wordsInLevel.toLocaleString(locale)} / {level.targetForLevel.toLocaleString(locale)}</strong>
                                <small>{level.currentLevel} · {labels.wordsStatLabel}</small>
                            </div>
                        </article>
                    </div>
                </aside>
            </div>

            <article className="dash-path-card">
                <header className="dash-path-header">
                    <h3>{labels.proficiencyPath}</h3>
                    <p>{labels.proficiencyPathSub}</p>
                </header>
                <div className="dash-path-steps">
                    {level.levels.map((step, index) => {
                        const active = isLevelActive(mastered, step, level.currentLevel);
                        const previous = level.levels[index - 1];
                        const lineFill = previous?.completed
                            ? 100
                            : previous?.id === level.currentLevel
                                ? level.levelPercent
                                : 0;
                        return (
                            <div
                                key={step.id}
                                className={`dash-path-step ${active ? 'is-active' : ''} ${step.completed ? 'is-complete' : ''} ${step.premium ? 'is-premium' : ''}`}
                            >
                                {index > 0 && (
                                    <span
                                        className={`dash-path-line ${lineFill > 0 ? 'is-progressing' : ''} ${lineFill >= 100 ? 'is-filled' : ''}`}
                                        style={{ '--dash-path-line-fill': `${lineFill}%` }}
                                        aria-hidden
                                    />
                                )}
                                <span className="dash-path-dot">{step.id}</span>
                                <strong>{levelCopy(step, labels)}</strong>
                            </div>
                        );
                    })}
                </div>
                <p className="dash-path-note">{streakMsg}</p>
                <p className="dash-path-current">
                    {labels.currentLevelLabel.replace(
                        '{level}',
                        levelCopy(level.current, labels),
                    )}
                </p>
            </article>

            <div className="dash-bottom-grid">
                {quickAccessItems.map((item) => {
                    const itemImage = CATEGORY_IMAGES[item.category] || nounsImage;
                    return (
                        <button
                            key={`${item.category}-${item.deckName}`}
                            type="button"
                            className="dash-category-card"
                            onClick={() => openSession({
                                category: item.category,
                                deck: item.deckName,
                            })}
                        >
                            <span className="dash-category-card-title">{item.categoryLabel}</span>
                            <span className="dash-category-thumb" style={{ '--dash-category-image': `url("${itemImage}")` }}>
                                <span>{item.levelId}</span>
                            </span>
                            <strong>{item.deckLabel || item.deckName}</strong>
                            <small>{labels.quickAccessSubtitle.replace('{level}', item.levelId)}</small>
                            <span className="dash-category-action">{labels.quickAccessButton}</span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
