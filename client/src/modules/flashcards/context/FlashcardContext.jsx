import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useCategoryContext } from './CategoryContext';
import { useUIContext } from '../../../context/UIContext';
import { flashcardRepository } from '../flashcardRepository';
import { useAuth } from '../../../context/AuthContext';

const FlashcardContext = createContext();

const LAST_DECK_KEY_PREFIX = 'flashcards_last_deck_';

const normalizeDefinitions = (defs) =>
    (defs || []).map((def) => ({ ...def, imagePath: def.imagePath ?? null }));

const normalizeCard = (card, index) => {
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
                    meaning: irregular[form].meaning
                }] : []);
                irregular[form] = { ...irregular[form], definitions: normalizeDefinitions(defs) };
            }
        });
        normalized.irregular = irregular;
    }

    return normalized;
};

export const FlashcardProvider = ({ children }) => {
    const { currentCategory } = useCategoryContext();
    const { setAppMessage } = useUIContext();

    const [masterData, setMasterData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isDeckLoading, setIsDeckLoading] = useState(false);
    const [loadingStage, setLoadingStage] = useState(null);
    const [deckNames, setDeckNames] = useState([]);
    const [currentDeckName, setCurrentDeckName] = useState(null);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [resetKey, setResetKey] = useState(0);
    const { isAuthenticated, user } = useAuth();

    const loadFlashcards = useCallback(async (category, deck) => {
        if (!category || !deck || !user?.email) return;
        setIsDeckLoading(true);
        setLoadingStage('loading_cards');
        setMasterData([]);
        setFilteredData([]);
        setResetKey((k) => k + 1);
        try {
            const data = await flashcardRepository.fetchDeckData(user.email, category, deck);
            const rawCards = Array.isArray(data) ? data : (data.flashcards || [data]);
            const normalized = rawCards.map(normalizeCard);
            setMasterData(normalized);
        } catch {
            setAppMessage({ text: 'Error al cargar tarjetas', isError: true });
        } finally {
            setLoadingStage(null);
            setIsDeckLoading(false);
        }
    }, [setAppMessage, user?.email]);

    useEffect(() => {
        setSelectedGroup(null);
        setResetKey((k) => k + 1);
    }, [currentCategory, currentDeckName]);

    useEffect(() => {
        let filtered = masterData;
        if (selectedGroup) {
            filtered = filtered.filter((c) => c.group_name === selectedGroup);
        }
        setFilteredData(filtered.filter((c) => !c.learned));
    }, [masterData, selectedGroup]);

    useEffect(() => {
        setCurrentIndex(0);
    }, [resetKey]);

    useEffect(() => {
        if (!currentCategory || !isAuthenticated) return;
        const loadDecks = async () => {
            setIsDeckLoading(true);
            setLoadingStage('loading_decks');
            try {
                const result = await flashcardRepository.fetchDecksForCategory(currentCategory);
                if (result.success && Array.isArray(result.files)) {
                    const names = result.files.map((f) => f.replace('.json', ''));
                    names.sort((a, b) => {
                        const getOrder = (n) => {
                            const lower = n.toLowerCase();
                            if (lower.includes('advanced')) return 3;
                            if (lower.includes('intermediate')) return 2;
                            if (lower.includes('basic')) return 1;
                            return 99;
                        };
                        return getOrder(a) - getOrder(b);
                    });
                    setDeckNames(names);
                    const storageKey = `${LAST_DECK_KEY_PREFIX}${currentCategory}`;
                    const saved = localStorage.getItem(storageKey);
                    setCurrentDeckName(saved && names.includes(saved) ? saved : names[0]);
                }
            } catch {
                setAppMessage({ text: 'Error al cargar decks', isError: true });
            } finally {
                setLoadingStage((prev) => (prev === 'loading_decks' ? null : prev));
                setIsDeckLoading(false);
            }
        };
        loadDecks();
    }, [currentCategory, setAppMessage, isAuthenticated]);

    useEffect(() => {
        if (currentCategory && currentDeckName && isAuthenticated) {
            loadFlashcards(currentCategory, currentDeckName);
        }
    }, [currentCategory, currentDeckName, loadFlashcards, isAuthenticated]);

    const changeDeck = (newDeck) => {
        setCurrentDeckName(newDeck);
        localStorage.setItem(`${LAST_DECK_KEY_PREFIX}${currentCategory}`, newDeck);
    };

    const updateCardImagePath = (cardId, newPath, defIndex, form = 'v1') => {
        const updater = (prev) =>
            prev.map((card) => {
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
        setMasterData(updater);
        setFilteredData(updater);
    };

    const markAsLearned = async () => {
        const card = filteredData[currentIndex];
        if (!card || !user?.email) return;
        try {
            await flashcardRepository.updateCardStatus(user.email, currentCategory, currentDeckName, card.id, true);
            const updated = masterData.map((c) => (c.id === card.id ? { ...c, learned: true } : c));
            setMasterData(updated);
            const remaining = updated.filter((c) => !c.learned);
            setFilteredData(remaining);
            if (currentIndex >= remaining.length) setCurrentIndex(Math.max(0, remaining.length - 1));
        } catch {
            setAppMessage({ text: 'Error al actualizar', isError: true });
        }
    };

    const resetDeck = async () => {
        if (!user?.email || !window.confirm('¿Resetear progreso?')) return;
        try {
            await flashcardRepository.resetDeckStatus(user.email, currentCategory, currentDeckName);
            loadFlashcards(currentCategory, currentDeckName);
        } catch {
            setAppMessage({ text: 'Error al resetear', isError: true });
        }
    };

    const resetGroup = async (groupName) => {
        if (!user?.email || !currentCategory || !currentDeckName) return false;

        const targetCards = masterData.filter((card) => {
            const cardGroupName = card.group_name || 'General';
            return cardGroupName === groupName && card.learned;
        });

        if (targetCards.length === 0) return false;

        setIsDeckLoading(true);
        setLoadingStage('loading_cards');

        try {
            await Promise.all(
                targetCards.map((card) =>
                    flashcardRepository.updateCardStatus(
                        user.email,
                        currentCategory,
                        currentDeckName,
                        card.id,
                        false,
                    ),
                ),
            );

            const updated = masterData.map((card) => {
                const cardGroupName = card.group_name || 'General';
                if (cardGroupName !== groupName) return card;
                return { ...card, learned: false };
            });

            setMasterData(updated);
            setSelectedGroup(groupName === 'General' ? null : groupName);
            setResetKey((k) => k + 1);
            return true;
        } catch {
            setAppMessage({ text: 'Error al reiniciar subcategoría', isError: true });
            return false;
        } finally {
            setLoadingStage(null);
            setIsDeckLoading(false);
        }
    };

    const nextCard = () => filteredData.length && setCurrentIndex((p) => (p + 1) % filteredData.length);
    const prevCard = () => filteredData.length && setCurrentIndex((p) => (p - 1 + filteredData.length) % filteredData.length);

    const changeGroup = (group) => {
        setSelectedGroup(group);
        setResetKey((k) => k + 1);
    };

    const value = {
        masterData, filteredData, currentIndex, setCurrentIndex,
        isDeckLoading, loadingStage, deckNames, currentDeckName,
        changeDeck, updateCardImagePath, markAsLearned, resetDeck, resetGroup,
        nextCard, prevCard,
        currentCard: filteredData[currentIndex],
        selectedGroup, setSelectedGroup: changeGroup
    };

    return <FlashcardContext.Provider value={value}>{children}</FlashcardContext.Provider>;
};

export const useFlashcardContext = () => useContext(FlashcardContext);
