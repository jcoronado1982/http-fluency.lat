import React from 'react';
import { useNavigate } from 'react-router-dom';
import config from '../../../config';
import { getModuleResumeSession, isDefaultHomeModule } from '../../index';
import { learningStatsPort } from '../composition';
import {
    STREAK_XP_REWARD,
    computeLevelProgress,
    computeXp,
    estimateMinutesRemaining,
    formatCategoryLabel,
    formatWordsRange,
    getStreakMessage,
    getTimeGreeting,
    isLevelActive,
    isLevelReached,
    XP_PER_WORD,
} from '../useCases/dashboardProgress';
import AnimatedNumber from './AnimatedNumber';

const RING = 88;
const STROKE = 8;
const R = (RING - STROKE) / 2;
const C = 2 * Math.PI * R;

function MiniRing({ percent, className = '' }) {
    const offset = C - (percent / 100) * C;
    return (
        <svg className={`dash-mini-ring ${className}`} width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} aria-hidden>
            <circle className="dash-mini-ring-track" cx={RING / 2} cy={RING / 2} r={R} strokeWidth={STROKE} />
            <circle
                className="dash-mini-ring-fill"
                cx={RING / 2}
                cy={RING / 2}
                r={R}
                strokeWidth={STROKE}
                strokeDasharray={C}
                strokeDashoffset={offset}
            />
        </svg>
    );
}

function StatPill({ children, title, description }) {
    return (
        <span className="dash-stat-pill-wrap" tabIndex={0}>
            <span className="dash-stat-pill">{children}</span>
            <span className="dash-stat-tooltip" role="tooltip">
                <strong className="dash-stat-tooltip-title">{title}</strong>
                <span className="dash-stat-tooltip-body">{description}</span>
            </span>
        </span>
    );
}

export default function DashboardHero({ stats, statsLoading, labels, language, userName }) {
    const navigate = useNavigate();
    const session = getModuleResumeSession(config);
    const flashcardPath = isDefaultHomeModule('flashcards', config) ? '/' : '/flashcard';

    const mastered = stats?.mastered_count ?? 0;
    const streak = stats?.streak_days ?? 0;
    const level = computeLevelProgress(mastered, language);
    const xp = computeXp(mastered);
    const greeting = getTimeGreeting(language, userName);
    const streakMsg = stats ? getStreakMessage(stats, labels) : labels.streakStartShort;

    const cardLabel = session?.cardWord || session?.deck || labels.defaultLesson;
    const categoryLabel = formatCategoryLabel(session?.category, language);
    const cardsRemaining = session?.cardsRemaining ?? 0;
    const minutesLeft = estimateMinutesRemaining(cardsRemaining);

    const onContinue = () => {
        learningStatsPort.touchStudyDay().catch(() => {});
        if (session) {
            navigate(flashcardPath, { state: { resumeSession: session } });
        } else {
            navigate(flashcardPath);
        }
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
            </header>

            <article className="dash-hero-card dash-mission">
                <span className="dash-mission-eyebrow">{labels.continueEyebrow}</span>
                <div className="dash-mission-body">
                    <div className="dash-mission-copy">
                        <h2 className="dash-mission-title">
                            <span className="dash-mission-bolt" aria-hidden>⚡</span>
                            {labels.continueLesson}
                        </h2>
                        <p className="dash-mission-topic">
                            {session
                                ? labels.missionTopic
                                    .replace('{word}', cardLabel)
                                    .replace('{category}', categoryLabel)
                                : labels.missionFallback}
                        </p>
                        {session && cardsRemaining > 0 && (
                            <p className="dash-mission-meta">
                                {labels.cardsRemaining.replace('{n}', String(cardsRemaining))}
                                {' · '}
                                {labels.minutesLeft.replace('{n}', String(minutesLeft))}
                            </p>
                        )}
                    </div>
                    <button type="button" className="dash-mission-cta" onClick={onContinue}>
                        {labels.continueButton}
                    </button>
                </div>
                <p className="dash-mission-reward">
                    <span aria-hidden>⭐</span>
                    {labels.nextReward.replace('{xp}', String(STREAK_XP_REWARD))}
                </p>
            </article>

            <article className="dash-hero-card dash-progress-panel">
                <div className="dash-tiles">
                    <article className={`dash-tile dash-tile--streak ${stats?.studied_today ? 'is-live' : ''} ${stats?.streak_at_risk ? 'is-risk' : ''}`}>
                        <div className="dash-tile-glow" aria-hidden />
                        <span className="dash-tile-label">🔥 {labels.streakLabel}</span>
                        <p className="dash-tile-value">
                            <AnimatedNumber value={streak} className="dash-tile-number" />
                            <span className="dash-tile-unit">
                                {streak === 1 ? labels.daySingular : labels.dayPlural}
                            </span>
                        </p>
                        <p className="dash-tile-hint">{streakMsg}</p>
                    </article>

                    <article className="dash-tile dash-tile--words">
                        <div className="dash-tile-glow dash-tile-glow--teal" aria-hidden />
                        <span className="dash-tile-label">🎯 {labels.wordsLabel}</span>
                        <div className="dash-tile-ring-row">
                            <div className="dash-tile-ring-wrap">
                                <MiniRing percent={level.levelPercent} />
                                <span className="dash-tile-ring-pct">
                                    <AnimatedNumber value={level.levelPercent} duration={1100} />
                                    %
                                </span>
                            </div>
                            <div className="dash-tile-words-copy">
                                <p className="dash-tile-value dash-tile-value--compact">
                                    <AnimatedNumber value={mastered} className="dash-tile-number dash-tile-number--sm" />
                                    <span className="dash-tile-slash">/</span>
                                    {level.targetForLevel.toLocaleString(language === 'es' ? 'es' : 'en')}
                                </p>
                                <p className="dash-tile-hint">
                                    {labels.wordsRequiredHint
                                        .replace('{range}', level.wordsRequiredRange)
                                        .replace('{level}', level.currentLevel)}
                                </p>
                            </div>
                        </div>
                    </article>
                </div>

                <div className="dash-panel-divider" />

                <div className="dash-journey">
                    <div className="dash-journey-header">
                        <div className="dash-journey-header-text">
                            <span className="dash-journey-level">{level.currentLevel}</span>
                            <span className="dash-journey-goal">
                                {labels.levelGoal.replace('{range}', level.wordsRequiredRange)}
                            </span>
                        </div>
                        <span className="dash-journey-bar-wrap">
                            <span
                                className="dash-journey-bar-fill"
                                style={{ width: `${level.levelPercent}%` }}
                            />
                        </span>
                        <span className="dash-journey-percent">{level.levelPercent}%</span>
                    </div>

                    <p className="dash-journey-required-title">{labels.wordsRequiredTitle}</p>

                    <div className="dash-journey-steps">
                        {level.levels.map((step, index) => {
                            const reached = isLevelReached(mastered, step);
                            const active = isLevelActive(mastered, step, level.currentLevel);
                            const locale = language === 'es' ? 'es' : 'en';
                            return (
                                <div
                                    key={step.id}
                                    className={`dash-journey-step ${reached ? 'is-done' : ''} ${active ? 'is-active' : ''} ${step.premium ? 'is-premium' : ''}`}
                                >
                                    {index > 0 && (
                                        <span className={`dash-journey-step-connector ${reached ? 'is-done' : ''}`} aria-hidden />
                                    )}
                                    <span className="dash-journey-dot">{step.id}</span>
                                    <span className="dash-journey-step-range">
                                        {formatWordsRange(step, locale)}
                                    </span>
                                    {step.premium && (
                                        <span className="dash-journey-premium">{labels.premiumBadge}</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {level.nextLevel && !level.isMaxLevel && (
                        <p className={`dash-journey-next ${level.isNextPremium ? 'is-premium' : ''}`}>
                            {level.isNextPremium
                                ? labels.nextLevelPremium.replace('{range}', level.nextWordsRequiredRange)
                                : labels.nextLevelDetail
                                    .replace('{level}', level.nextLevel)
                                    .replace('{range}', level.nextWordsRequiredRange)}
                            {!level.isNextPremium && level.wordsToNext > 0 && (
                                <span className="dash-journey-next-count">
                                    {labels.wordsToGo.replace(
                                        '{n}',
                                        level.wordsToNext.toLocaleString(language === 'es' ? 'es' : 'en'),
                                    )}
                                </span>
                            )}
                        </p>
                    )}
                </div>

                <div className="dash-panel-divider" />

                <div className="dash-quick-stats">
                    <StatPill title={labels.statStreakTipTitle} description={labels.statStreakTip}>
                        🔥 {streak} {streak === 1 ? labels.daySingular : labels.dayPlural}
                    </StatPill>
                    <StatPill title={labels.statLearnedTipTitle} description={labels.statLearnedTip}>
                        📚 <AnimatedNumber value={mastered} duration={700} /> {labels.learnedShort}
                    </StatPill>
                    <StatPill
                        title={labels.statXpTipTitle}
                        description={labels.statXpTip.replace('{xp}', String(XP_PER_WORD))}
                    >
                        ⭐ <AnimatedNumber value={xp} duration={900} /> XP
                    </StatPill>
                    <StatPill
                        title={labels.statLevelTipTitle}
                        description={labels.statLevelTip.replace('{level}', level.currentLevel)}
                    >
                        🎯 {level.currentLevel} {labels.levelShort}
                    </StatPill>
                </div>
            </article>
        </section>
    );
}
