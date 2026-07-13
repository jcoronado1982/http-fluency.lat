/**
 * Casos de uso de sesión de deck (lógica pura, sin React).
 */

import { filterUnlearned } from './deckUseCases.js';

export const updateCardImageInDeck = (cards, cardId, newPath, defIndex, form = 'v1') =>
    cards.map((card) => {
        if (card.id !== cardId) return card;
        if (form === 'v1') {
            const defs = [...card.definitions];
            if (defs[defIndex]) defs[defIndex] = { ...defs[defIndex], imagePath: newPath };
            return { ...card, definitions: defs };
        }
        if (card.irregular) {
            const newIrregular = { ...card.irregular };
            const targetForm = form === 'v2' ? 'past' : 'participle';
            const block = newIrregular[targetForm];
            if (block) {
                if (Array.isArray(block.definitions) && block.definitions.length > 0) {
                    const defs = [...block.definitions];
                    if (defs[defIndex]) defs[defIndex] = { ...defs[defIndex], imagePath: newPath };
                    newIrregular[targetForm] = { ...block, definitions: defs };
                } else {
                    newIrregular[targetForm] = { ...block, imagePath: newPath };
                }
            }
            return { ...card, irregular: newIrregular };
        }
        return card;
    });

export const applyLearnedStatus = (cards, cardId, learned) =>
    cards.map((c) => (c.id === cardId ? { ...c, learned } : c));

export const getGroupLearnedCards = (cards, groupName) =>
    cards.filter((card) => {
        const cardGroupName = card.group_name || 'General';
        return cardGroupName === groupName && card.learned;
    });

export const resetGroupInDeck = (cards, groupName) =>
    cards.map((card) => {
        const cardGroupName = card.group_name || 'General';
        if (cardGroupName !== groupName) return card;
        return { ...card, learned: false };
    });

export const computeFilteredAfterLearn = (masterData, cardId, selectedGroup) => {
    const updated = applyLearnedStatus(masterData, cardId, true);
    const remaining = filterUnlearned(updated, selectedGroup);
    return { updated, remaining, completed: remaining.length === 0 };
};

export const computeNextIndex = (currentIndex, remainingLength) =>
    currentIndex >= remainingLength ? Math.max(0, remainingLength - 1) : currentIndex;
