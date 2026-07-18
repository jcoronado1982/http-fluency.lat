import { useCallback, useEffect, useRef, useState } from 'react';
import { useCategoryContext } from '../context/CategoryContext';
import { useFlashcardUiContext } from '../context/FlashcardUiContext';
import { useUIContext } from '../../../context/UIContext';
import { useDialog } from '../../../context/AppContext';
import { flashcardPort } from '../composition';
import { queueSrsBatch, listSrsBatches, removeSrsBatch } from '../adapters/srsOutboxIndexedDb';
import { SrsEngine } from '../domain/SrsEngine';
import { useAuth } from '../../../context/AuthContext';
import { getFlashcardTranslations } from '../config/translations';
import { markUserNavigation } from '../navigationIntent';
import {
    filterUnlearned,
    getCourseDirectionFromStudyLanguage,
    getLevelFromDeckName,
    normalizeDeckResponse,
    resolvePersistedChoice,
    sortDeckNames,
    usesNestedLevelDecks,
} from '../useCases/deckUseCases';
import {
    computeFilteredAfterLearn,
    computeNextIndex,
    getGroupLearnedCards,
    resolveResumeCardIndex,
    resetGroupInDeck,
    updateCardImageInDeck,
} from '../useCases/deckSessionUseCases';
import {
    LAST_DECK_KEY_PREFIX,
    writeResumeSession,
} from '../config/sessionKeys';
import { consumeFlashcardPreload, resetFlashcardPreload } from '../preload';

/** Número de tarjetas acumuladas antes de forzar un flush automático. */
const BATCH_FLUSH_SIZE = 3;
const PENDING_PROGRESS_STORAGE_KEY = 'flashcards_pending_progress_batches';
const PRELOAD_TIMEOUT_MS = 1500;

function raceWithTimeout(promise, timeoutMs) {
    return Promise.race([
        promise,
        new Promise((resolve) => {
            window.setTimeout(() => resolve(null), timeoutMs);
        }),
    ]);
}

function readStoredProgressBatches() {
    try {
        const raw = localStorage.getItem(PENDING_PROGRESS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeStoredProgressBatches(batches) {
    try {
        const next = Array.isArray(batches) ? batches.filter((batch) => batch?.cards?.length) : [];
        if (next.length === 0) {
            localStorage.removeItem(PENDING_PROGRESS_STORAGE_KEY);
            return;
        }
        localStorage.setItem(PENDING_PROGRESS_STORAGE_KEY, JSON.stringify(next));
    } catch {
        // El guardado local es respaldo; si falla, el batch en memoria sigue activo.
    }
}

function normalizeStoredCourseDirection(courseDirection) {
    return courseDirection === 'en_es' ? 'en_es' : 'es_en';
}

function makeProgressBatchKey({ userId, category, deck, courseDirection }) {
    return `${userId || ''}::${normalizeStoredCourseDirection(courseDirection)}::${category || ''}::${deck || ''}`;
}

function persistProgressBatch(context, cards) {
    if (!context?.userId || !context?.category || !context?.deck || !Array.isArray(cards) || cards.length === 0) {
        return;
    }

    const batches = readStoredProgressBatches();
    const targetKey = makeProgressBatchKey(context);
    const existingIndex = batches.findIndex((batch) => makeProgressBatchKey(batch) === targetKey);
    const existing = existingIndex >= 0 ? batches[existingIndex] : { ...context, cards: [] };
    const mergedCards = new Map(existing.cards.map((card) => [card.index, card]));

    cards.forEach((card) => {
        mergedCards.set(card.index, { index: card.index, learned: Boolean(card.learned) });
    });

    const nextBatch = { ...context, cards: Array.from(mergedCards.values()) };
    if (existingIndex >= 0) {
        batches[existingIndex] = nextBatch;
    } else {
        batches.push(nextBatch);
    }
    writeStoredProgressBatches(batches);
}

function removeStoredProgressBatch(context) {
    const targetKey = makeProgressBatchKey(context);
    writeStoredProgressBatches(
        readStoredProgressBatches().filter((batch) => makeProgressBatchKey(batch) !== targetKey),
    );
}

function removeStoredProgressCards(context, indexes) {
    const targetKey = makeProgressBatchKey(context);
    const indexSet = new Set(indexes);
    const batches = readStoredProgressBatches().map((batch) => {
        if (makeProgressBatchKey(batch) !== targetKey) return batch;
        return {
            ...batch,
            cards: batch.cards.filter((card) => !indexSet.has(card.index)),
        };
    });
    writeStoredProgressBatches(batches);
}

export function useDeckSession(resumeSession = null) {
    const { currentCategory } = useCategoryContext();
    const { setIsCatalogVisible } = useFlashcardUiContext();
    const { setAppMessage, language = 'en', studyLanguage = 'en' } = useUIContext();
    const { confirm } = useDialog();
    const controlsCopy = getFlashcardTranslations(language).controls;
    const { isAuthenticated, user } = useAuth();
    const courseDirection = getCourseDirectionFromStudyLanguage(studyLanguage);

    const [masterData, setMasterData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isDeckLoading, setIsDeckLoading] = useState(false);
    const [loadingStage, setLoadingStage] = useState(null);
    const [deckNames, setDeckNames] = useState([]);
    const [deckNamesCategory, setDeckNamesCategory] = useState(null);
    const [currentDeckName, setCurrentDeckName] = useState(null);
    const [deckSummaries, setDeckSummaries] = useState({});
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
    const batchContextRef = useRef({ category: null, deck: null, userId: null, courseDirection });
    const summarizeDeck = useCallback((cards) => ({
        total: cards.length,
        learned: cards.filter((card) => card.learned).length,
    }), []);

    const loadFlashcards = useCallback(async (category, deck) => {
        if (!category || !deck || !user?.email) return;
        setIsDeckLoading(true);
        setLoadingStage('loading_cards');
        setResetKey((k) => k + 1);
        try {
            const applyLoadedDeck = (cards) => {
                setMasterData(cards);
                setFilteredData(filterUnlearned(cards));
                setDeckSummaries((prev) => ({ ...prev, [deck]: summarizeDeck(cards) }));
            };

            const preloaded = await raceWithTimeout(
                consumeFlashcardPreload(user.email, null, studyLanguage),
                PRELOAD_TIMEOUT_MS,
            );
            if (
                preloaded?.courseDirection === courseDirection
                && preloaded?.category === category
                && preloaded?.deck === deck
                && Array.isArray(preloaded.deckData)
                && preloaded.deckData.length > 0
            ) {
                applyLoadedDeck(preloaded.deckData);
                return;
            }

            const data = await flashcardPort.fetchDeckData(user.email, category, deck, courseDirection);
            const normalized = normalizeDeckResponse(data);
            if (normalized.length === 0) {
                throw new Error(`Deck vacío: ${category}/${deck}`);
            }
            applyLoadedDeck(normalized);
        } catch (err) {
            console.error('Error al cargar tarjetas:', { category, deck, courseDirection, error: err });
            const message = String(err?.message || '');
            const isRecoverableDeckError = message.includes('Deck vacío')
                || message.includes('not found')
                || message.includes('no encontrado');
            const fallbackDeck = isRecoverableDeckError && usesNestedLevelDecks(category)
                ? deckNames.find((name) => name !== deck)
                : null;
            if (fallbackDeck) {
                setCurrentDeckName(fallbackDeck);
                localStorage.setItem(`${LAST_DECK_KEY_PREFIX}${category}`, fallbackDeck);
            } else {
                setMasterData([]);
                setFilteredData([]);
                setAppMessage({ text: `Error al cargar tarjetas: ${deck}`, isError: true });
            }
        } finally {
            setLoadingStage(null);
            setIsDeckLoading(false);
        }
    }, [courseDirection, deckNames, setAppMessage, studyLanguage, summarizeDeck, user?.email]);

    useEffect(() => {
        setCurrentDeckName(null);
        setDeckNames([]);
        setDeckNamesCategory(null);
        setMasterData([]);
        setFilteredData([]);
        setDeckSummaries({});
    }, [currentCategory]);

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
                const preloaded = await raceWithTimeout(
                    consumeFlashcardPreload(user?.email, resumeSession, studyLanguage),
                    PRELOAD_TIMEOUT_MS,
                );
                if (
                    preloaded?.courseDirection === courseDirection
                    && preloaded?.category === currentCategory
                    && Array.isArray(preloaded.deckNames)
                    && preloaded.deckNames.length > 0
                ) {
                    const names = preloaded.deckNames;
                    setDeckNames(names);
                    setDeckNamesCategory(currentCategory);
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

                const result = await flashcardPort.fetchDecksForCategory(currentCategory, courseDirection);
                if (result.success && Array.isArray(result.files)) {
                    const names = sortDeckNames(result.files, currentCategory);
                    setDeckNames(names);
                    setDeckNamesCategory(currentCategory);
                    const storageKey = `${LAST_DECK_KEY_PREFIX}${currentCategory}`;
                    const persistedDeck = resolvePersistedChoice(storageKey, names, names[0]);
                    const fallbackDeck = usesNestedLevelDecks(currentCategory) && persistedDeck
                        ? (names.find((name) => getLevelFromDeckName(name) === getLevelFromDeckName(persistedDeck)) ?? names[0])
                        : persistedDeck;
                    const preferredDeck = resumeSession?.category === currentCategory && resumeSession?.deck
                        && names.includes(resumeSession.deck)
                        ? resumeSession.deck
                        : fallbackDeck;
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
    }, [courseDirection, currentCategory, setAppMessage, isAuthenticated, resumeSession, studyLanguage, user?.email]);

    useEffect(() => {
        if (
            currentCategory
            && currentDeckName
            && isAuthenticated
            && deckNamesCategory === currentCategory
            && deckNames.includes(currentDeckName)
        ) {
            loadFlashcards(currentCategory, currentDeckName);
        }
    }, [currentCategory, currentDeckName, deckNames, deckNamesCategory, loadFlashcards, isAuthenticated]);

    useEffect(() => {
        if (
            !usesNestedLevelDecks(currentCategory)
            || deckNamesCategory !== currentCategory
            || !user?.email
            || !isAuthenticated
            || deckNames.length === 0
        ) {
            return;
        }

        const missingDecks = deckNames.filter((deckName) => !deckSummaries[deckName]);
        if (missingDecks.length === 0) return;

        let cancelled = false;
        const loadDeckSummaries = async () => {
            const results = await Promise.allSettled(
                missingDecks.map(async (deckName) => {
                    if (deckName === currentDeckName && masterData.length > 0) {
                        return [deckName, summarizeDeck(masterData)];
                    }

                    const data = await flashcardPort.fetchDeckData(
                        user.email,
                        currentCategory,
                        deckName,
                        courseDirection,
                    );
                    const normalized = normalizeDeckResponse(data);
                    return [deckName, summarizeDeck(normalized)];
                }),
            );

            if (cancelled) return;

            setDeckSummaries((prev) => {
                const next = { ...prev };
                results.forEach((result) => {
                    if (result.status === 'fulfilled') {
                        const [deckName, summary] = result.value;
                        next[deckName] = summary;
                    }
                });
                return next;
            });
        };

        void loadDeckSummaries();
        return () => {
            cancelled = true;
        };
    }, [
        currentCategory,
        currentDeckName,
        deckNames,
        deckNamesCategory,
        deckSummaries,
        isAuthenticated,
        masterData,
        courseDirection,
        summarizeDeck,
        user?.email,
    ]);

    useEffect(() => {
        if (resumeApplied || !resumeSession) return;
        if (resumeSession.category !== currentCategory || resumeSession.deck !== currentDeckName) return;
        if (!masterData.length) return;

        const resumeGroup = resumeSession.selectedGroup === 'General'
            ? null
            : resumeSession.selectedGroup;
        const resumeGroupRemaining = resumeGroup ? filterUnlearned(masterData, resumeGroup) : [];
        const shouldResumeGroup = Boolean(resumeGroup && resumeGroupRemaining.length);

        if (shouldResumeGroup && resumeGroup !== selectedGroup) {
            setSelectedGroup(resumeGroup);
            return;
        }

        if (!shouldResumeGroup && selectedGroup) {
            setSelectedGroup(null);
            return;
        }

        const remaining = filterUnlearned(masterData, shouldResumeGroup ? resumeGroup : null);
        if (!remaining.length) {
            setResumeApplied(true);
            return;
        }

        setCurrentIndex(resolveResumeCardIndex(remaining, resumeSession));
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

        const { category, deck, userId, courseDirection: batchCourseDirection } = batchContextRef.current;
        if (!category || !deck || !userId) return;

        const cards = Array.from(batch.values()).map(({ index, learned }) => ({ index, learned }));
        pendingBatchRef.current = new Map();
        const storedContext = { category, deck, userId, courseDirection: batchCourseDirection };
        persistProgressBatch(storedContext, cards);

        try {
            await flashcardPort.updateCardsBatch(userId, category, deck, cards, batchCourseDirection);
            removeStoredProgressBatch(storedContext);
        } catch (err) {
            cards.forEach((card) => {
                pendingBatchRef.current.set(card.index, card);
            });
            if (!silent) {
                setAppMessage({ text: `Error al guardar progreso: ${err.message}`, isError: true });
            }
        }
    }, [setAppMessage]);

    const previousCourseDirectionRef = useRef(courseDirection);
    useEffect(() => {
        if (previousCourseDirectionRef.current === courseDirection) return;
        void flushProgress({ silent: true });
        previousCourseDirectionRef.current = courseDirection;
    }, [courseDirection, flushProgress]);

    /**
     * Versión fire-and-forget para beforeunload (no puede usar async/await).
     * Usa fetch con keepalive: true para que el navegador complete la petición
     * incluso si la página se está cerrando.
     */
    const flushProgressBeacon = useCallback(() => {
        const batch = pendingBatchRef.current;
        if (batch.size === 0) return;
        const { category, deck, userId, courseDirection: batchCourseDirection } = batchContextRef.current;
        if (!category || !deck || !userId) return;

        const cards = Array.from(batch.values()).map(({ index, learned }) => ({ index, learned }));
        pendingBatchRef.current = new Map();
        persistProgressBatch({ category, deck, userId, courseDirection: batchCourseDirection }, cards);

        const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '';
        const token = localStorage.getItem('auth_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        try {
            fetch(`${apiBase}/api/update-batch`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    user_id: userId,
                    category,
                    deck,
                    cards,
                    course_direction: normalizeStoredCourseDirection(batchCourseDirection),
                }),
                keepalive: true,
                credentials: 'include',
            });
        } catch (_) {
            // No podemos hacer nada en beforeunload
        }
    }, []);

    useEffect(() => {
        if (!isAuthenticated || !user?.email) return;

        let cancelled = false;
        const retryStoredBatches = async () => {
            const batches = readStoredProgressBatches().filter((batch) => batch.userId === user.email);
            for (const batch of batches) {
                if (cancelled) return;
                try {
                    await flashcardPort.updateCardsBatch(
                        batch.userId,
                        batch.category,
                        batch.deck,
                        batch.cards,
                        normalizeStoredCourseDirection(batch.courseDirection),
                    );
                    removeStoredProgressBatch(batch);
                } catch {
                    return;
                }
            }

            const srsBatches = (await listSrsBatches().catch(() => [])).filter(
                (batch) => batch.userId === user.email,
            );
            for (const batch of srsBatches) {
                if (cancelled) return;
                try {
                    await flashcardPort.updateCardsBatch(
                        batch.userId,
                        batch.category,
                        batch.deck,
                        batch.cards,
                        normalizeStoredCourseDirection(batch.courseDirection),
                    );
                    await removeSrsBatch(batch);
                } catch {
                    return;
                }
            }
        };

        void retryStoredBatches();
        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, user?.email]);

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
        resetFlashcardPreload(user.email);

        // Actualización optimista: la UI avanza de inmediato sin esperar la red.
        const { updated, remaining, completed } = computeFilteredAfterLearn(masterData, card.id, selectedGroup);
        setMasterData(updated);
        setFilteredData(remaining);
        setDeckSummaries((prev) => ({ ...prev, [currentDeckName]: summarizeDeck(updated) }));
        if (completed) setJustCompletedInSession(true);
        setCurrentIndex((prev) => computeNextIndex(prev, remaining.length));

        // Registrar en el lote pendiente usando el índice original de la tarjeta.
        batchContextRef.current = {
            category: currentCategory,
            deck: currentDeckName,
            userId: user.email,
            courseDirection,
        };
        pendingBatchRef.current.set(card.id, { index: card.id, learned: true });
        persistProgressBatch(batchContextRef.current, Array.from(pendingBatchRef.current.values()));

        // Flush automático cuando el lote alcanza el tamaño máximo.
        if (pendingBatchRef.current.size >= BATCH_FLUSH_SIZE) {
            void flushProgress({ silent: true });
        }
    };

    /**
     * La selección manual convierte la tarjeta en candidata SRS para hoy.
     * Se respalda primero en IndexedDB para sobrevivir modo offline/cierre.
     */
    const addToReview = async () => {
        const card = filteredData[currentIndex];
        if (!card || !user?.email || !currentCategory || !currentDeckName) return;

        const context = {
            category: currentCategory,
            deck: currentDeckName,
            userId: user.email,
            courseDirection,
        };
        const update = {
            index: card.id,
            learned: true,
            ...SrsEngine.scheduleForReview(new Date()),
        };

        try {
            await queueSrsBatch(context, [update]);
            await flashcardPort.updateCardsBatch(
                context.userId,
                context.category,
                context.deck,
                [update],
                context.courseDirection,
            );
            await removeSrsBatch(context);
            setAppMessage({ text: language === 'es' ? 'Tarjeta agregada al repaso diario.' : 'Card added to daily review.', isError: false });
        } catch {
            setAppMessage({
                text: language === 'es'
                    ? 'Tarjeta guardada localmente; se sincronizará al reconectar.'
                    : 'Card saved locally; it will sync when reconnected.',
                isError: false,
            });
        }

        // Al entrar en SRS queda aprendida también para el flujo libre actual.
        const { updated, remaining, completed } = computeFilteredAfterLearn(masterData, card.id, selectedGroup);
        setMasterData(updated);
        setFilteredData(remaining);
        setDeckSummaries((prev) => ({ ...prev, [currentDeckName]: summarizeDeck(updated) }));
        if (completed) setJustCompletedInSession(true);
        setCurrentIndex((previous) => computeNextIndex(previous, remaining.length));
    };

    const resetDeck = async () => {
        if (!user?.email) return;
        resetFlashcardPreload(user.email);

        const shouldReset = await confirm({
            title: controlsCopy.resetConfirmTitle,
            message: controlsCopy.resetConfirmMessage,
            tone: 'danger',
            confirmLabel: controlsCopy.reset,
        });
        if (!shouldReset) return;

        // El reset solo afecta al deck/tópico activo. Conservamos los lotes pendientes
        // de los demás decks y categorías del usuario.
        pendingBatchRef.current = new Map();
        removeStoredProgressBatch({
            category: currentCategory,
            deck: currentDeckName,
            userId: user.email,
            courseDirection,
        });

        try {
            await flashcardPort.resetDeckStatus(
                user.email,
                currentCategory,
                currentDeckName,
                courseDirection,
            );
            resetFlashcardPreload(user.email);
            const resetCards = masterData.map((card) => ({ ...card, learned: false }));
            setMasterData(resetCards);
            setFilteredData(filterUnlearned(resetCards, selectedGroup));
            setDeckSummaries((prev) => ({
                ...prev,
                [currentDeckName]: { total: resetCards.length, learned: 0 },
            }));
            setJustCompletedInSession(false);
            setResetKey((k) => k + 1);
            await loadFlashcards(currentCategory, currentDeckName);
        } catch {
            setAppMessage({ text: 'Error al resetear', isError: true });
        }
    };

    const resetDeckByName = async (deckName) => {
        if (!user?.email || !currentCategory || !deckName) return false;
        resetFlashcardPreload(user.email);

        if (deckName === currentDeckName) {
            pendingBatchRef.current = new Map();
        }
        removeStoredProgressBatch({
            category: currentCategory,
            deck: deckName,
            userId: user.email,
            courseDirection,
        });

        setIsDeckLoading(true);
        setLoadingStage('loading_cards');

        try {
            await flashcardPort.resetDeckStatus(
                user.email,
                currentCategory,
                deckName,
                courseDirection,
            );
            resetFlashcardPreload(user.email);

            if (deckName === currentDeckName) {
                const resetCards = masterData.map((card) => ({ ...card, learned: false }));
                setMasterData(resetCards);
                setFilteredData(filterUnlearned(resetCards, selectedGroup));
                setJustCompletedInSession(false);
                setResetKey((k) => k + 1);
                await loadFlashcards(currentCategory, deckName);
            }

            setDeckSummaries((prev) => ({
                ...prev,
                [deckName]: { total: prev[deckName]?.total ?? 0, learned: 0 },
            }));
            return true;
        } catch {
            setAppMessage({ text: 'Error al resetear', isError: true });
            return false;
        } finally {
            setLoadingStage(null);
            setIsDeckLoading(false);
        }
    };

    const resetGroup = async (groupName) => {
        if (!user?.email || !currentCategory || !currentDeckName) return false;
        resetFlashcardPreload(user.email);

        const targetCards = getGroupLearnedCards(masterData, groupName);
        if (targetCards.length === 0) return false;

        // Vaciar lote antes de resetear un grupo (no tiene sentido guardar tarjetas que se van a desaprender).
        const targetIndexes = targetCards.map((card) => card.id);
        targetIndexes.forEach((index) => pendingBatchRef.current.delete(index));
        removeStoredProgressCards(
            { category: currentCategory, deck: currentDeckName, userId: user.email, courseDirection },
            targetIndexes,
        );

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
                        courseDirection,
                    ),
                ),
            );

            const updated = resetGroupInDeck(masterData, groupName);
            setMasterData(updated);
            setDeckSummaries((prev) => ({ ...prev, [currentDeckName]: summarizeDeck(updated) }));
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
        deckSummaries,
        currentDeckName,
        changeDeck,
        updateCardImagePath,
        markAsLearned,
        addToReview,
        resetDeck,
        resetDeckByName,
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
