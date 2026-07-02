/**
 * Casos de uso de flashcards (capa de aplicación, lógica pura).
 * Equivalente frontend de `backend/mod_flashcards`.
 */

import { LANDING_DEMO_CATEGORY } from '../../../contracts/landingDemoNamespace';

export const NESTED_LEVEL_CATEGORIES = [
    'verbs',
    'nouns',
    'adjectives',
    'adverbs',
    'connectors',
    'determinant',
    'phrasal_verbs',
    'preposition',
    'pronouns',
];
const LEVEL_ORDER = { basic: 1, intermediate: 2, advanced: 3 };

const isAppStudyCategory = (name) => name && name !== LANDING_DEMO_CATEGORY;
export const usesNestedLevelDecks = (category) => NESTED_LEVEL_CATEGORIES.includes(category);

const normalizeDefinitions = (defs) =>
    (defs || []).map((def) => ({ ...def, imagePath: def.imagePath ?? null }));

export const normalizeCard = (card, index) => {
    const base = { ...card, ...(card.extra || {}) };

    const normalized = {
        ...base,
        id: index,
        definitions: normalizeDefinitions(base.definitions),
        learned: base.learned || false,
    };

    if (normalized.irregular) {
        const irregular = { ...normalized.irregular };
        ['past', 'participle'].forEach((form) => {
            if (irregular[form]) {
                const defs = irregular[form].definitions || (irregular[form].usage_example ? [{
                    usage_example: irregular[form].usage_example,
                    usage_example_es: irregular[form].usage_example_es,
                    pronunciation_guide_es: irregular[form].pronunciation_guide_es,
                    meaning: irregular[form].meaning,
                }] : []);
                irregular[form] = { ...irregular[form], definitions: normalizeDefinitions(defs) };
            }
        });
        normalized.irregular = irregular;
    }

    return normalized;
};

export const normalizeDeckResponse = (data) => {
    const rawCards = Array.isArray(data) ? data : (data.flashcards || [data]);
    return rawCards.map(normalizeCard);
};

export const getLevelFromDeckName = (deckName) => {
    if (!deckName) return 'basic';
    const lower = deckName.toLowerCase();
    if (lower.includes('advanced')) return 'advanced';
    if (lower.includes('intermediate')) return 'intermediate';
    if (lower.includes('basic')) return 'basic';
    return 'basic';
};

export const getDeckCategoryName = (deckName) => {
    if (!deckName) return '';
    const [maybeLevel, maybeCategory] = deckName.split('/');
    return maybeCategory ? maybeCategory.replace('.json', '') : maybeLevel.replace('.json', '');
};

export const formatDeckCategoryName = (deckName) =>
    getDeckCategoryName(deckName)
        .replace(/[_-]/g, ' ')
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

export const sortDeckNames = (files, category = null) => {
    const names = files.map((f) => f.replace('.json', ''));
    return names.sort((a, b) => {
        const levelDiff = (LEVEL_ORDER[getLevelFromDeckName(a)] ?? 99) - (LEVEL_ORDER[getLevelFromDeckName(b)] ?? 99);
        if (levelDiff !== 0) return levelDiff;

        const categoryA = getDeckCategoryName(a);
        const categoryB = getDeckCategoryName(b);
        return categoryA.localeCompare(categoryB);
    });
};

export const filterUnlearned = (cards, selectedGroup = null) => {
    let scoped = cards;
    if (selectedGroup) {
        scoped = scoped.filter((c) => c.group_name === selectedGroup);
    }
    return scoped.filter((c) => !c.learned);
};

export const parseCategoriesResponse = (result) => {
    const items = Array.isArray(result)
        ? result
        : (result?.success && Array.isArray(result.categories) ? result.categories : []);

    const names = items
        .map((c) => (typeof c === 'object' ? c?.name : c))
        .filter((name) => isAppStudyCategory(name));
    const totals = {};
    items.forEach((c) => {
        if (c && typeof c === 'object' && c.name && isAppStudyCategory(c.name)) {
            totals[c.name] = c.total;
        }
    });

    return { names, totals };
};

export const resolvePersistedChoice = (storageKey, options, fallback) => {
    const saved = localStorage.getItem(storageKey);
    if (saved && options.includes(saved)) return saved;
    return fallback;
};
