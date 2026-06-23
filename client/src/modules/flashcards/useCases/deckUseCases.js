/**
 * Casos de uso de flashcards (capa de aplicación, lógica pura).
 * Equivalente frontend de `backend/mod_flashcards`.
 */

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

export const sortDeckNames = (files) => {
    const names = files.map((f) => f.replace('.json', ''));
    return names.sort((a, b) => {
        const getOrder = (n) => {
            const lower = n.toLowerCase();
            if (lower.includes('advanced')) return 3;
            if (lower.includes('intermediate')) return 2;
            if (lower.includes('basic')) return 1;
            return 99;
        };
        return getOrder(a) - getOrder(b);
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

    const names = items.map((c) => (typeof c === 'object' ? c?.name : c)).filter(Boolean);
    const totals = {};
    items.forEach((c) => {
        if (c && typeof c === 'object' && c.name) totals[c.name] = c.total;
    });

    return { names, totals };
};

export const resolvePersistedChoice = (storageKey, options, fallback) => {
    const saved = localStorage.getItem(storageKey);
    if (saved && options.includes(saved)) return saved;
    return fallback;
};
