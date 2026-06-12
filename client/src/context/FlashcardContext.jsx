import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useCategoryContext } from './CategoryContext';
import { useUIContext } from './UIContext';
import { flashcardRepository } from '../repositories/flashcardRepository';
import { useAuth } from './AuthContext';

const FlashcardContext = createContext();

const LAST_DECK_KEY_PREFIX = 'flashcards_last_deck_';

// ---------------------------------------------------------------------------
// Normalización de datos — separada de la lógica de estado (SRP)
// ---------------------------------------------------------------------------
const normalizeDefinitions = (defs) =>
    (defs || []).map((def) => ({ ...def, imagePath: def.imagePath ?? null }));

const normalizeCard = (card, index) => {
    // Si los datos vienen dentro de 'extra' (por el flattening de Rust), los subimos al nivel superior
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

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export const FlashcardProvider = ({ children }) => {
    const { currentCategory } = useCategoryContext();
    const { setAppMessage } = useUIContext();

    const [masterData, setMasterData]       = useState([]);
    const [filteredData, setFilteredData]   = useState([]);
    const [currentIndex, setCurrentIndex]   = useState(0);
    const [isDeckLoading, setIsDeckLoading] = useState(false);
    const [deckNames, setDeckNames]         = useState([]);
    const [currentDeckName, setCurrentDeckName] = useState(null);
    const [selectedGroup, setSelectedGroup] = useState(null);
    // resetKey se incrementa solo cuando queremos reiniciar el índice intencionalmente
    const [resetKey, setResetKey]           = useState(0);
    const { isAuthenticated, user } = useAuth();

    // --- Carga del deck ---
    const loadFlashcards = useCallback(async (category, deck) => {
        if (!category || !deck || !user?.email) return;
        setIsDeckLoading(true);
        setMasterData([]);   // limpiar inmediatamente para no mostrar datos del deck anterior
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
            setIsDeckLoading(false);
        }
    }, [setAppMessage, user?.email]);

    // Reset selectedGroup when category or deck changes
    useEffect(() => {
        setSelectedGroup(null);
        setResetKey((k) => k + 1); // también reiniciar índice al cambiar categoría/deck
    }, [currentCategory, currentDeckName]);

    // Recalcular filteredData cuando cambia masterData o selectedGroup.
    // IMPORTANTE: NO reseteamos currentIndex aquí porque masterData puede cambiar
    // por razones triviales como actualizar imagePath. En cambio usamos resetKey.
    useEffect(() => {
        let filtered = masterData;
        if (selectedGroup) {
            filtered = filtered.filter((c) => c.group_name === selectedGroup);
        }
        setFilteredData(filtered.filter((c) => !c.learned));
    }, [masterData, selectedGroup]);

    // Solo reiniciamos el índice cuando lo pedimos explícitamente (nuevo deck, nuevo grupo)
    useEffect(() => {
        setCurrentIndex(0);
    }, [resetKey]);

    // --- Carga de decks cuando cambia la categoría ---
    useEffect(() => {
        if (!currentCategory || !isAuthenticated) return;
        const loadDecks = async () => {
            setIsDeckLoading(true);
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

    // --- Actualizar imagePath en memoria ---
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

    // --- Progreso ---
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

    const nextCard = () => filteredData.length && setCurrentIndex((p) => (p + 1) % filteredData.length);
    const prevCard = () => filteredData.length && setCurrentIndex((p) => (p - 1 + filteredData.length) % filteredData.length);

    // Cambiar grupo y reiniciar índice
    const changeGroup = (group) => {
        setSelectedGroup(group);
        setResetKey((k) => k + 1);
    };

    const value = {
        masterData, filteredData, currentIndex, setCurrentIndex,
        isDeckLoading, deckNames, currentDeckName,
        changeDeck, updateCardImagePath, markAsLearned, resetDeck,
        nextCard, prevCard,
        currentCard: filteredData[currentIndex],
        selectedGroup, setSelectedGroup: changeGroup
    };

    return <FlashcardContext.Provider value={value}>{children}</FlashcardContext.Provider>;
};

export const useFlashcardContext = () => useContext(FlashcardContext);
