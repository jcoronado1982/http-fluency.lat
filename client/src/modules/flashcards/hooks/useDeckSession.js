import { useCallback, useEffect, useRef, useState } from 'react';
import { useCategoryContext } from '../context/CategoryContext';
import { useFlashcardUiContext } from '../context/FlashcardUiContext';
import { useUIContext } from '../../../context/UIContext';
import { useDialog } from '../../../context/AppContext';
import { flashcardPort } from '../composition';
import { useAuth } from '../../../context/AuthContext';
import { getFlashcardTranslations } from '../config/translations';
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
import {
    LAST_DECK_KEY_PREFIX,
    writeResumeSession,
} from '../config/sessionKeys';
import { consumeFlashcardPreload } from '../preload';

/** Número de tarjetas acumuladas antes de forzar un flush automático. */
const BATCH_FLUSH_SIZE = 8;

export function useDeckSession(resumeSession = null) {
    const { currentCategory } = useCategoryContext();
    const { setIsCatalogVisible } = useFlashcardUiContext();
    const { setAppMessage, language = 'en' } = useUIContext();
    const { confirm } = useDialog();
    const controlsCopy = getFlashcardTranslations(language).controls;
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
    const [resumeApplied, setResumeApplied] = useState(false);

    /**
     * Lote de progreso pendiente de enviar.
     * Clave: card.id  →  Valor: { index, learned, category, deck }
     * Se acumula hasta BATCH_FLUSH_SIZE o hasta que el usuario cambia de deck/grupo.
     */
    const pendingBatchRef = useRef(new Map());
    /** Contexto activo en el momento de acumular (para el flush correcto al cambiar). */
    const batchContextRef = useRef({ category: null, deck: null, userId: null });

    const loadFlashcards = useCallback(async (category, deck) => {
        if (!category || !deck || !user?.email) return;
        setIsDeckLoading(true);
        setLoadingStage('loading_cards');
        setMasterData([]);
        setFilteredData([]);
        setResetKey((k) => k + 1);
        try {
            const preloaded = await consumeFlashcardPreload(user.email);
            if (
                preloaded?.category === category
                && preloaded?.deck === deck
                && Array.isArray(preloaded.deckData)
            ) {
                setMasterData(preloaded.deckData);
                setFilteredData(filterUnlearned(preloaded.deckData));
                return;
            }

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
                const preloaded = await consumeFlashcardPreload(user?.email, resumeSession);
                if (
                    preloaded?.category === currentCategory
                    && Array.isArray(preloaded.deckNames)
                    && preloaded.deckNames.length > 0
                ) {
                    const names = preloaded.deckNames;
                    setDeckNames(names);
                    const storageKey = `${LAST_DECK_KEY_PREFIX}${currentCategory}`;
                    const preferredDeck = resumeSession?.category === currentCategory && resumeSession?.deck
                        && names.includes(resumeSession.deck)
                        ? resumeSession.deck
                        : (preloaded.deck && names.includes(preloaded.deck)
                            ? preloaded.deck
                            : resolvePersistedChoice(storageKey, names, names[0]));
                    setCurrentDeckName(preferredDeck);
                    return;
                }

                const result = await flashcardPort.fetchDecksForCategory(currentCategory);
                if (result.success && Array.isArray(result.files)) {
                    const names = sortDeckNames(result.files);
                    setDeckNames(names);
                    const storageKey = `${LAST_DECK_KEY_PREFIX}${currentCategory}`;
                    const preferredDeck = resumeSession?.category === currentCategory && resumeSession?.deck
                        && names.includes(resumeSession.deck)
                        ? resumeSession.deck
                        : resolvePersistedChoice(storageKey, names, names[0]);
                    setCurrentDeckName(preferredDeck);
                }
            } catch {
                setAppMessage({ text: 'Error al cargar decks', isError: true });
            } finally {
                setLoadingStage((prev) => (prev === 'loading_decks' ? null : prev));
                setIsDeckLoading(false);
            }
        };
        loadDecks();
    }, [currentCategory, setAppMessage, isAuthenticated, resumeSession, user?.email]);

    useEffect(() => {
        if (currentCategory && currentDeckName && isAuthenticated) {
            loadFlashcards(currentCategory, currentDeckName);
        }
    }, [currentCategory, currentDeckName, loadFlashcards, isAuthenticated]);

    useEffect(() => {
        if (resumeApplied || !resumeSession) return;
        if (resumeSession.category !== currentCategory || resumeSession.deck !== currentDeckName) return;
        if (!masterData.length) return;

        if (resumeSession.selectedGroup) {
            const group = resumeSession.selectedGroup === 'General' ? null : resumeSession.selectedGroup;
            if (group !== selectedGroup) {
                setSelectedGroup(group);
                return;
            }
        }

        const remaining = filterUnlearned(masterData, selectedGroup);
        if (!remaining.length) {
            setResumeApplied(true);
            return;
        }

        let nextIndex = 0;
        if (typeof resumeSession.cardId === 'number') {
            const byId = remaining.findIndex((card) => card.id === resumeSession.cardId);
            if (byId >= 0) nextIndex = byId;
        } else if (typeof resumeSession.cardIndex === 'number') {
            nextIndex = Math.min(resumeSession.cardIndex, remaining.length - 1);
        }

        setCurrentIndex(nextIndex);
        setResumeApplied(true);
    }, [
        resumeApplied,
        resumeSession,
        masterData,
        selectedGroup,
        currentCategory,
        currentDeckName,
    ]);

    useEffect(() => {
        if (!currentCategory || !currentDeckName || !filteredData.length) return;
        const card = filteredData[currentIndex];
        const scopeCards = selectedGroup
            ? masterData.filter((c) => c.group_name === selectedGroup)
            : masterData;
        writeResumeSession({
            category: currentCategory,
            deck: currentDeckName,
            cardIndex: currentIndex,
            cardId: card?.id,
            cardWord: card?.word || card?.name || card?.translation || '',
            selectedGroup: selectedGroup || null,
            cardsRemaining: filteredData.length,
            deckTotal: scopeCards.length,
        });
    }, [currentCategory, currentDeckName, currentIndex, filteredData, selectedGroup, masterData]);

    /**
     * Envía el lote pendiente al backend en una sola petición POST /api/update-batch.
     * Se llama automáticamente al cambiar de deck/grupo, al desmontar y en beforeunload.
     * @param {{ silent?: boolean }} [opts]
     */
    const flushProgress = useCallback(async ({ silent = false } = {}) => {
        const batch = pendingBatchRef.current;
        if (batch.size === 0) return;

        const { category, deck, userId } = batchContextRef.current;
        if (!category || !deck || !userId) return;

        const cards = Array.from(batch.values()).map(({ index, learned }) => ({ index, learned }));
        pendingBatchRef.current = new Map();

        try {
            await flashcardPort.updateCardsBatch(userId, category, deck, cards);
        } catch (err) {
            if (!silent) {
                setAppMessage({ text: `Error al guardar progreso: ${err.message}`, isError: true });
            }
        }
    }, [setAppMessage]);

    /**
     * Versión fire-and-forget para beforeunload (no puede usar async/await).
     * Usa fetch con keepalive: true para que el navegador complete la petición
     * incluso si la página se está cerrando.
     */
    const flushProgressBeacon = useCallback(() => {
        const batch = pendingBatchRef.current;
        if (batch.size === 0) return;
        const { category, deck, userId } = batchContextRef.current;
        if (!category || !deck || !userId) return;

        const cards = Array.from(batch.values()).map(({ index, learned }) => ({ index, learned }));
        pendingBatchRef.current = new Map();

        const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '';
        try {
            fetch(`${apiBase}/api/update-batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, category, deck, cards }),
                keepalive: true,
                credentials: 'include',
            });
        } catch (_) {
            // No podemos hacer nada en beforeunload
        }
    }, []);

    const changeDeck = (newDeck) => {
        markUserNavigation();
        void flushProgress({ silent: true });
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

        // Actualización optimista: la UI avanza de inmediato sin esperar la red.
        const { updated, remaining, completed } = computeFilteredAfterLearn(masterData, card.id, selectedGroup);
        setMasterData(updated);
        setFilteredData(remaining);
        if (completed) setJustCompletedInSession(true);
        setCurrentIndex((prev) => computeNextIndex(prev, remaining.length));

        // Registrar en el lote pendiente usando el índice original de la tarjeta.
        batchContextRef.current = {
            category: currentCategory,
            deck: currentDeckName,
            userId: user.email,
        };
        pendingBatchRef.current.set(card.id, { index: card.id, learned: true });

        // Flush automático cuando el lote alcanza el tamaño máximo.
        if (pendingBatchRef.current.size >= BATCH_FLUSH_SIZE) {
            void flushProgress({ silent: true });
        }
    };

    const resetDeck = async () => {
        if (!user?.email) return;

        const shouldReset = await confirm({
            title: controlsCopy.resetConfirmTitle,
            message: controlsCopy.resetConfirmMessage,
            tone: 'danger',
            confirmLabel: controlsCopy.reset,
        });
        if (!shouldReset) return;

        // Al resetear, descartamos el lote pendiente (el reset los borra de la DB de todas formas).
        pendingBatchRef.current = new Map();

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

        // Vaciar lote antes de resetear un grupo (no tiene sentido guardar tarjetas que se van a desaprender).
        pendingBatchRef.current = new Map();

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
        void flushProgress({ silent: true });
        setSelectedGroup(group);
        setResetKey((k) => k + 1);
        setJustCompletedInSession(false);
        setIsCatalogVisible(false);
    };

    // Flush al desmontar el componente (navegación SPA, cierre de sesión, etc.)
    useEffect(() => {
        return () => {
            void flushProgress({ silent: true });
        };
    }, [flushProgress]);

    // Flush en beforeunload (cierre de pestaña / recarga de página).
    // Usa keepalive fetch para que el navegador complete la petición tras cerrar.
    useEffect(() => {
        window.addEventListener('beforeunload', flushProgressBeacon);
        return () => window.removeEventListener('beforeunload', flushProgressBeacon);
    }, [flushProgressBeacon]);

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
        flushProgress,
    };
}
