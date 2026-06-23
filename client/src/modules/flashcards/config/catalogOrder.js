import catalogOrder from './catalogOrder.json';

const categoryEntries = Array.isArray(catalogOrder.categories) ? catalogOrder.categories : [];
const categoryIndexMap = new Map(
    categoryEntries.map((entry, index) => [entry.name, index]),
);

const categoryOrderMap = new Map(
    categoryEntries.map(({ name, order }) => [name, order]),
);

const groupOrderMap = new Map(
    categoryEntries.map(({ name, decks }) => {
        const deckMap = new Map(
            Object.entries(decks || {}).map(([deckName, groups]) => [
                deckName,
                new Map((groups || []).map(({ name: groupName, order }) => [groupName, order])),
            ]),
        );
        return [name, deckMap];
    }),
);

const sortByOrder = (items, getOrder) =>
    [...items].sort((a, b) => {
        const aOrder = getOrder(a);
        const bOrder = getOrder(b);
        const aKnown = Number.isFinite(aOrder);
        const bKnown = Number.isFinite(bOrder);

        if (aKnown && bKnown) return aOrder - bOrder;
        if (aKnown) return -1;
        if (bKnown) return 1;
        return 0;
    });

export const FALLBACK_CATEGORIES = sortByOrder(
    categoryEntries.map(({ name }) => name),
    (name) => categoryOrderMap.get(name),
);

export const sortCategories = (categories) =>
    sortByOrder(categories, (name) => categoryOrderMap.get(name));

export const sortGroups = (categoryName, deckName, groups) => {
    const deckMap = groupOrderMap.get(categoryName);
    const orderMap = deckMap?.get(deckName);

    if (!orderMap) return [...groups];

    return sortByOrder(groups, (groupName) => orderMap.get(groupName));
};

export const getNextStudyStep = (categoryName, deckName, groupName) => {
    const categoryIndex = categoryIndexMap.get(categoryName);
    if (categoryIndex === undefined) return null;

    const categoryEntry = categoryEntries[categoryIndex];
    const deckNames = Object.keys(categoryEntry.decks || {});
    const deckIndex = deckNames.indexOf(deckName);

    if (deckIndex !== -1 && groupName) {
        const groups = categoryEntry.decks?.[deckName] || [];
        const groupIndex = groups.findIndex((group) => group.name === groupName);
        if (groupIndex !== -1 && groupIndex + 1 < groups.length) {
            return {
                type: 'group',
                category: categoryName,
                deck: deckName,
                group: groups[groupIndex + 1].name,
            };
        }
    }

    if (deckIndex !== -1 && deckIndex + 1 < deckNames.length) {
        return {
            type: 'deck',
            category: categoryName,
            deck: deckNames[deckIndex + 1],
            group: null,
        };
    }

    if (categoryIndex + 1 < categoryEntries.length) {
        const nextCategory = categoryEntries[categoryIndex + 1];
        const nextDeck = Object.keys(nextCategory.decks || {})[0] || null;
        return {
            type: 'category',
            category: nextCategory.name,
            deck: nextDeck,
            group: null,
        };
    }

    return null;
};
