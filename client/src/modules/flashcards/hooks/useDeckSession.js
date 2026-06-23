import { useCallback, useEffect, useState } from 'react';
import { useCategoryContext } from '../context/CategoryContext';
import { useUIContext } from '../../../context/UIContext';
import { flashcardPort } from '../composition';
import { useAuth } from '../../../context/AuthContext';
import { markUserNavigation } from '../navigationIntent';
import {
    filterUnlearned,
    normalizeDeckResponse,
    resolvePersistedChoice,
    sortDeckNames,
} from '../useCases/deckUseCases';
import {
    computeFilteredAfterLearn,
    computeNextIndex,
    getGroupLearnedCards,
    resetGroupInDeck,
    updateCardImageInDeck,
} from '../useCases/deckSessionUseCases';

const LAST_DECK_KEY_PREFIX = 'flashcards_last_deck_';

export function useDeckSession() {
    const { currentCategory } = useCategoryContext();
    const { setAppMessage } = useUIContext();
    const { isAuthenticated, user } = useAuth();

    const [masterData, setMasterData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isDeckLoading, setIsDeckLoading] = useState(false);
    const [loadingStage, setLoadingStage] = useState(null);
    const [deckNames, setDeckNames] = useState([]);
    const [currentDeckName, setCurrentDeckName] = useState(null);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [resetKey, setResetKey] = useState(0);
    const [justCompletedInSession, setJustCompletedInSession] = useState(false);

    const loadFlashcards = useCallback(async (category, deck) => {
        if (!category || !deck || !user?.email) return;
        setIsDeckLoading(true);
        setLoadingStage('loading_cards');
        setMasterData([]);
        setFilteredData([]);
        setResetKey((k) => k + 1);
        try {
            const data = await flashcardPort.fetchDeckData(user.email, category, deck);
            const normalized = normalizeDeckResponse(data);
            setMasterData(normalized);
            setFilteredData(filterUnlearned(normalized));
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
        setJustCompletedInSession(false);
    }, [currentCategory, currentDeckName]);

    useEffect(() => {
        setFilteredData(filterUnlearned(masterData, selectedGroup));
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
                const result = await flashcardPort.fetchDecksForCategory(currentCategory);
                if (result.success && Array.isArray(result.files)) {
                    const names = sortDeckNames(result.files);
                    setDeckNames(names);
                    const storageKey = `${LAST_DECK_KEY_PREFIX}${currentCategory}`;
                    setCurrentDeckName(resolvePersistedChoice(storageKey, names, names[0]));
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
        markUserNavigation();
        setCurrentDeckName(newDeck);
        localStorage.setItem(`${LAST_DECK_KEY_PREFIX}${currentCategory}`, newDeck);
    };

    const updateCardImagePath = (cardId, newPath, defIndex, form = 'v1') => {
        const updater = (prev) => updateCardImageInDeck(prev, cardId, newPath, defIndex, form);
        setMasterData(updater);
        setFilteredData(updater);
    };

    const markAsLearned = async () => {
        const card = filteredData[currentIndex];
        if (!card || !user?.email) return;
        try {
            await flashcardPort.updateCardStatus(user.email, currentCategory, currentDeckName, card.id, true);
            const { updated, remaining, completed } = computeFilteredAfterLearn(masterData, card.id, selectedGroup);
            setMasterData(updated);
            setFilteredData(remaining);
            if (completed) setJustCompletedInSession(true);
            setCurrentIndex((prev) => computeNextIndex(prev, remaining.length));
        } catch {
            setAppMessage({ text: 'Error al actualizar', isError: true });
        }
    };

    const resetDeck = async () => {
        if (!user?.email || !window.confirm('¿Resetear progreso?')) return;
        try {
            await flashcardPort.resetDeckStatus(user.email, currentCategory, currentDeckName);
            loadFlashcards(currentCategory, currentDeckName);
        } catch {
            setAppMessage({ text: 'Error al resetear', isError: true });
        }
    };

    const resetGroup = async (groupName) => {
        if (!user?.email || !currentCategory || !currentDeckName) return false;

        const targetCards = getGroupLearnedCards(masterData, groupName);
        if (targetCards.length === 0) return false;

        setIsDeckLoading(true);
        setLoadingStage('loading_cards');

        try {
            await Promise.all(
                targetCards.map((card) =>
                    flashcardPort.updateCardStatus(
                        user.email,
                        currentCategory,
                        currentDeckName,
                        card.id,
                        false,
                    ),
                ),
            );

            const updated = resetGroupInDeck(masterData, groupName);
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
        markUserNavigation();
        setSelectedGroup(group);
        setResetKey((k) => k + 1);
        setJustCompletedInSession(false);
    };

    return {
        masterData,
        filteredData,
        currentIndex,
        setCurrentIndex,
        isDeckLoading,
        loadingStage,
        deckNames,
        currentDeckName,
        changeDeck,
        updateCardImagePath,
        markAsLearned,
        resetDeck,
        resetGroup,
        nextCard,
        prevCard,
        currentCard: filteredData[currentIndex],
        selectedGroup,
        setSelectedGroup: changeGroup,
        justCompletedInSession,
    };
}
