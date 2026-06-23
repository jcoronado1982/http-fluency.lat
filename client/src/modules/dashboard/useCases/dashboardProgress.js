export const LEVELS = [
    { id: 'A1', min: 0, max: 700, wordsMin: 500, wordsMax: 700, premium: false },
    { id: 'A2', min: 700, max: 1200, wordsMin: 1000, wordsMax: 1200, premium: false },
    { id: 'B1', min: 1200, max: 2500, wordsMin: 2000, wordsMax: 2500, premium: false },
    { id: 'B2', min: 2500, max: 5000, wordsMin: 4000, wordsMax: 5000, premium: true },
];

/** Free learning path ends at B1. */
export const FREE_PATH_TARGET = 2500;
export const B2_TARGET = 5000;
export const XP_PER_WORD = 8;
export const STREAK_XP_REWARD = 10;
export const SECONDS_PER_CARD = 30;

export function formatWordsRange(level, language = 'en') {
    const locale = language === 'es' ? 'es' : 'en';
    const fmt = (n) => n.toLocaleString(locale);
    return `${fmt(level.wordsMin)} – ${fmt(level.wordsMax)}`;
}

export function computeXp(masteredCount = 0) {
    return masteredCount * XP_PER_WORD;
}

export function computeLevelProgress(masteredCount = 0, language = 'en') {
    const count = Math.max(0, masteredCount);
    const current = LEVELS.find((level) => count < level.max) || LEVELS[LEVELS.length - 1];
    const currentIndex = LEVELS.indexOf(current);
    const span = current.max - current.min;
    const inLevel = count - current.min;
    const levelPercent = span > 0 ? Math.min(100, Math.round((inLevel / span) * 100)) : 100;
    const next = LEVELS[currentIndex + 1] || null;

    const wordsToNext = next && !next.premium
        ? Math.max(0, next.wordsMin - count)
        : next?.premium
            ? Math.max(0, next.wordsMin - count)
            : 0;

    return {
        levels: LEVELS,
        current,
        currentLevel: current.id,
        nextLevel: next?.id || null,
        next,
        levelPercent,
        wordsInLevel: inLevel,
        wordsToNext,
        wordsRequiredRange: formatWordsRange(current, language),
        nextWordsRequiredRange: next ? formatWordsRange(next, language) : null,
        isNextPremium: Boolean(next?.premium),
        isMaxFreeLevel: current.id === 'B1' && count >= current.max,
        isMaxLevel: count >= LEVELS[LEVELS.length - 1].max,
        targetForLevel: current.max,
    };
}

export function estimateMinutesRemaining(cardsRemaining = 0) {
    if (cardsRemaining <= 0) return 0;
    return Math.max(1, Math.ceil((cardsRemaining * SECONDS_PER_CARD) / 60));
}

export function formatCategoryLabel(category, language = 'en') {
    if (!category) return '';
    const lower = category.toLowerCase();
    const es = {
        verbs: 'verbos',
        nouns: 'sustantivos',
        pronouns: 'pronombres',
        adjectives: 'adjetivos',
        adverbs: 'adverbios',
        preposition: 'preposiciones',
        connectors: 'conectores',
        determinant: 'determinantes',
        phrasal_verbs: 'phrasal verbs',
    };
    if (language === 'es' && es[lower]) return es[lower];
    return lower.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getTimeGreeting(language, name) {
    const hour = new Date().getHours();
    const copy = {
        en: {
            morning: 'Good morning',
            afternoon: 'Good afternoon',
            evening: 'Good evening',
        },
        es: {
            morning: 'Buenos días',
            afternoon: 'Buenas tardes',
            evening: 'Buenas noches',
        },
    };
    const t = copy[language === 'es' ? 'es' : 'en'];
    const slot = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const greeting = t[slot];
    return name ? `${greeting}, ${name}` : greeting;
}

export function getStreakMessage(stats, labels) {
    const streak = stats?.streak_days ?? 0;
    if (stats?.studied_today && streak > 0) return labels.streakKeepLearning;
    if (stats?.streak_at_risk && streak > 0) return labels.streakAtRisk;
    if (streak > 0) return labels.streakComeBack;
    return labels.streakStartShort;
}

export function isLevelReached(masteredCount, level) {
    return masteredCount >= level.max;
}

export function isLevelActive(masteredCount, level, currentLevelId) {
    return currentLevelId === level.id;
}
