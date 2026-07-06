import catalogOrder from '../../../contracts/catalogOrder.json';

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
const CATALOG_CATEGORIES = Array.isArray(catalogOrder.categories) ? catalogOrder.categories : [];
const LEVEL_TO_DECK_KEY = {
    A1: '1-basic',
    A2: '2-intermediate',
    B1: '3-advanced',
    B2: '3-advanced',
};
const QUICK_ACCESS_ACCENTS = ['#f472b6', '#fb923c', '#be185d'];
const DECK_LABEL_TRANSLATIONS_ES = {
    General: 'General',
    'Being & State': 'Ser y Estado',
    'Action & Movement': 'Accion y Movimiento',
    'Daily Life': 'Vida Diaria',
    Communication: 'Comunicacion',
    'Change & Result': 'Cambio y Resultado',
    'Mind & Senses': 'Mente y Sentidos',
    'Social & Exchange': 'Social e Intercambio',
    'Handling & Creating': 'Manejo y Creacion',
    'Daily Routine': 'Rutina Diaria',
    'Building & Creating': 'Construccion y Creacion',
    'Managing & Control': 'Gestion y Control',
    'Thinking & Deciding': 'Pensamiento y Decision',
    'Daily Tasks': 'Tareas Diarias',
    'Feelings & Reactions': 'Sentimientos y Reacciones',
    'Body & Movement': 'Cuerpo y Movimiento',
    'Social & Daily Life': 'Vida Social y Diaria',
    'Academic Communication': 'Comunicacion Academica',
    'Age & Novelty': 'Edad y Novedad',
    Animals: 'Animales',
    'Arts & Media': 'Arte y Medios',
    'Body Parts': 'Partes del Cuerpo',
    Clothing: 'Ropa',
    Colors: 'Colores',
    'Critical Thinking': 'Pensamiento Critico',
    Directions: 'Direcciones',
    Family: 'Familia',
    Feelings: 'Sentimientos',
    'Feelings & Emotions': 'Sentimientos y Emociones',
    Food: 'Comida',
    'General Concepts': 'Conceptos Generales',
    'Goals & Results': 'Metas y Resultados',
    'Government & Society': 'Gobierno y Sociedad',
    'Health & Medicine': 'Salud y Medicina',
    'Health & Well-being': 'Salud y Bienestar',
    Household: 'Hogar',
    'Interrogative/Relative': 'Interrogativos / Relativos',
    'Mind & Attitude': 'Mente y Actitud',
    Months: 'Meses',
    Nature: 'Naturaleza',
    'Nature & Environment': 'Naturaleza y Medio Ambiente',
    Numbers: 'Numeros',
    Object: 'Objetos',
    People: 'Personas',
    'Personality & Social': 'Personalidad y Social',
    'Personality Traits': 'Rasgos de Personalidad',
    'Physical & Sensory': 'Fisico y Sensorial',
    'Physical State': 'Estado Fisico',
    Places: 'Lugares',
    'Places & Locations': 'Lugares y Ubicaciones',
    'Professional Action': 'Accion Profesional',
    'Professional & Business': 'Profesional y Negocios',
    'Quality & Value': 'Calidad y Valor',
    'School & Work': 'Escuela y Trabajo',
    'Science & Biology': 'Ciencia y Biologia',
    Seasons: 'Estaciones',
    'Size & Dimension': 'Tamano y Dimension',
    'Social Dynamics': 'Dinamicas Sociales',
    'Social & Status': 'Social y Estatus',
    Society: 'Sociedad',
    'Speed & Time': 'Velocidad y Tiempo',
    'State & Fortune': 'Estado y Fortuna',
    Subject: 'Sujeto',
    'Technology & Internet': 'Tecnologia e Internet',
    Time: 'Tiempo',
    Transportation: 'Transporte',
    'Transportation & Travel': 'Transporte y Viajes',
    'Value & Wealth': 'Valor y Riqueza',
};

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

export function computeDashboardLevelProgress(stats, language = 'en') {
    const backendLevels = Array.isArray(stats?.levels) ? stats.levels : [];
    if (backendLevels.length === 0) {
        return computeLevelProgress(stats?.mastered_count ?? 0, language);
    }

    const levels = backendLevels.map((level, index) => {
        const targetCount = Math.max(0, level.target_count ?? 0);
        const cumulativeTarget = Math.max(0, level.cumulative_target ?? 0);
        const min = Math.max(0, cumulativeTarget - targetCount);
        return {
            id: level.level,
            min,
            max: cumulativeTarget,
            wordsMin: index === 0 ? 0 : min,
            wordsMax: cumulativeTarget,
            masteredCount: Math.max(0, level.mastered_count ?? 0),
            targetCount,
            cumulativeMastered: Math.max(0, level.cumulative_mastered ?? 0),
            cumulativeTarget,
            completed: Boolean(level.completed),
            premium: Boolean(level.premium),
        };
    });

    const current = levels.find((level) => level.id === stats?.current_level)
        || levels.find((level) => !level.completed)
        || levels[levels.length - 1];
    const currentIndex = levels.indexOf(current);
    const next = levels[currentIndex + 1] || null;
    const levelPercent = Number.isFinite(stats?.level_percent)
        ? Math.max(0, Math.min(100, Math.round(stats.level_percent)))
        : current.targetCount > 0
            ? Math.max(0, Math.min(100, Math.round((current.masteredCount / current.targetCount) * 100)))
            : current.completed
                ? 100
                : 0;

    return {
        levels,
        current,
        currentLevel: current.id,
        nextLevel: next?.id || null,
        next,
        levelPercent,
        wordsInLevel: current.masteredCount,
        wordsToNext: Math.max(0, current.targetCount - current.masteredCount),
        wordsRequiredRange: formatWordsRange(current, language),
        nextWordsRequiredRange: next ? formatWordsRange(next, language) : null,
        isNextPremium: Boolean(next?.premium),
        isMaxFreeLevel: current.id === 'B1' && current.completed,
        isMaxLevel: Boolean(current.completed && !next),
        targetForLevel: current.targetCount,
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
        verbs: 'Verbos',
        nouns: 'Sustantivos',
        pronouns: 'Pronombres',
        adjectives: 'Adjetivos',
        adverbs: 'Adverbios',
        preposition: 'Preposiciones',
        connectors: 'Conectores',
        determinant: 'Determinantes',
        phrasal_verbs: 'Verbos frasales',
    };
    if (language === 'es' && es[lower]) return es[lower];
    return lower.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatDeckLabel(deckName, language = 'en') {
  if (!deckName) return '';
  if (language !== 'es') return deckName;
  const phrasalPrefix = 'Phrasal Verbs: ';
  if (deckName.startsWith(phrasalPrefix)) {
        return `Verbos frasales: ${deckName.slice(phrasalPrefix.length)}`;
  }
    return DECK_LABEL_TRANSLATIONS_ES[deckName] || deckName;
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
    const daysSinceLastStudy = stats?.days_since_last_study;

    if (stats?.studied_today && streak > 0) {
        if (streak === 1) return labels.streakConsecutiveDay || labels.streakStudiedToday;
        return (labels.streakConsecutiveDays || labels.streakKeepLearning).replace('{n}', streak.toLocaleString());
    }

    if (stats?.streak_at_risk && streak > 0) {
        if (streak === 1) return labels.streakConsecutiveDay || labels.streakAtRisk;
        return (labels.streakConsecutiveDays || labels.streakAtRisk).replace('{n}', streak.toLocaleString());
    }

    if (Number.isFinite(daysSinceLastStudy) && daysSinceLastStudy > 0) {
        if (daysSinceLastStudy === 1) return labels.streakMissedDay || labels.streakComeBack;
        return (labels.streakMissedDays || labels.streakComeBack).replace('{n}', daysSinceLastStudy.toLocaleString());
    }

    if (streak > 0) return labels.streakComeBack;
    return labels.streakStartShort;
}

function getDeckKeyForLevel(levelId) {
    return LEVEL_TO_DECK_KEY[levelId] || LEVEL_TO_DECK_KEY.A1;
}

function getFirstDeckName(categoryEntry, deckKey) {
    const deckEntries = Array.isArray(categoryEntry?.decks?.[deckKey]) ? categoryEntry.decks[deckKey] : [];
    if (deckEntries[0]?.name) return deckEntries[0].name;
    const fallbackDeckKey = Object.keys(categoryEntry?.decks || {})[0];
    const fallbackDeckEntries = fallbackDeckKey ? categoryEntry.decks?.[fallbackDeckKey] : [];
    return fallbackDeckEntries?.[0]?.name || fallbackDeckKey || null;
}

export function getDashboardQuickAccessItems({
    levelId,
    currentCategory = null,
    language = 'en',
    limit = 3,
} = {}) {
    const deckKey = getDeckKeyForLevel(levelId);
    const currentIndex = currentCategory ? CATALOG_CATEGORIES.findIndex((entry) => entry.name === currentCategory) : -1;
    const rotated = currentIndex >= 0
        ? [
            ...CATALOG_CATEGORIES.slice(currentIndex + 1),
            ...CATALOG_CATEGORIES.slice(0, currentIndex),
        ]
        : CATALOG_CATEGORIES;
    const candidates = rotated.filter((entry) => entry.name !== currentCategory);
    const matched = candidates.filter((entry) => Array.isArray(entry.decks?.[deckKey]) && entry.decks[deckKey].length > 0);

    return (matched.length > 0 ? matched : candidates)
        .slice(0, limit)
        .map((entry, index) => ({
            category: entry.name,
            categoryLabel: formatCategoryLabel(entry.name, language),
            deckName: getFirstDeckName(entry, deckKey),
            deckLabel: formatDeckLabel(getFirstDeckName(entry, deckKey), language),
            levelId: levelId || 'A1',
            accent: QUICK_ACCESS_ACCENTS[index % QUICK_ACCESS_ACCENTS.length],
        }));
}

export function getDashboardCarouselItems({
    levelId,
    currentCategory = null,
    currentSession = null,
    language = 'en',
} = {}) {
    const deckKey = getDeckKeyForLevel(levelId);
    const entries = Array.isArray(CATALOG_CATEGORIES) ? [...CATALOG_CATEGORIES] : [];
    const currentIndex = currentCategory ? entries.findIndex((entry) => entry.name === currentCategory) : -1;
    const rotated = currentIndex >= 0
        ? [
            ...entries.slice(currentIndex),
            ...entries.slice(0, currentIndex),
        ]
        : entries;

    const categoryItems = rotated
        .filter((entry) => entry.name !== currentSession?.category)
        .map((entry) => ({
            key: `category-${entry.name}`,
            category: entry.name,
            categoryLabel: formatCategoryLabel(entry.name, language),
            deckName: getFirstDeckName(entry, deckKey) || '',
            deckLabel: formatDeckLabel(getFirstDeckName(entry, deckKey), language),
            resumeSession: {
                category: entry.name,
                deck: getFirstDeckName(entry, deckKey),
            },
            cardsRemaining: 0,
            isCurrentGoal: false,
        }));

    if (currentSession?.category && currentSession?.deck) {
        categoryItems.unshift({
            key: `session-${currentSession.category}-${currentSession.deck}`,
            category: currentSession.category,
            categoryLabel: formatCategoryLabel(currentSession.category, language),
            deckName: currentSession.deck,
            deckLabel: formatDeckLabel(currentSession.deck, language),
            resumeSession: currentSession,
            cardsRemaining: currentSession.cardsRemaining ?? 0,
            isCurrentGoal: true,
        });
    }

    return categoryItems;
}

export function isLevelReached(masteredCount, level) {
    return masteredCount >= level.max;
}

export function isLevelActive(masteredCount, level, currentLevelId) {
    return currentLevelId === level.id;
}
