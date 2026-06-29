import { useState, useEffect, useCallback, useRef } from 'react';
import { useStudyMediaContext } from '../StudyMediaContext';
import { AI_ENABLED } from '../../../config/api';
import { useAuth } from '../../../context/AuthContext';
import { useFlashcardContext } from '../context/flashcardStudyContext';
import {
    isLandingDemoCategory,
} from '../../../contracts/landingDemoNamespace';
import { resolveStudyMediaNamespace } from '../../../contracts/studyMediaVariants';

const MAX_IMAGE_ATTEMPTS = 3;
const IMAGE_RETRY_DELAY = 5000;
const GENERATING_UI_DELAY_MS = 2500;
const GEN_SLOT_WAIT_MS = 120000;
const GEN_SLOT_POLL_MS = 200;

const FORM_DEF_MAP = {
    v1: (card) => card.definitions || [],
    v2: (card) => defsFromFormBlock(card.irregular?.past),
    v3: (card) => defsFromFormBlock(card.irregular?.participle),
};

/** Igual que CardFront: past/participle pueden traer usage_example sin array definitions. */
function defsFromFormBlock(block) {
    if (!block) return [];
    if (Array.isArray(block.definitions) && block.definitions.length > 0) {
        return block.definitions;
    }
    if (block.usage_example) {
        return [{
            usage_example: block.usage_example,
            usage_example_es: block.usage_example_es,
            pronunciation_guide_es: block.pronunciation_guide_es,
            meaning: block.meaning,
            imagePath: block.imagePath ?? null,
        }];
    }
    return [];
}

/** En demo landing, la ruta debe corresponder al tiempo activo (v1/v2/v3). */
function pathMatchesVerbForm(path, form) {
    if (!path) return false;
    const clean = path.split('?')[0];
    if (form === 'v2') return clean.includes('_v2.');
    if (form === 'v3') return clean.includes('_v3.');
    return !clean.includes('_v2.') && !clean.includes('_v3.');
}

/** Solo landing demo: envía el complemento aparte (la frase de la tarjeta va sin mezclar). */
function demoSceneComplement(extra) {
    const trimmed = extra?.trim();
    return trimmed || undefined;
}

export function useImageGeneration({
    cardData,
    currentCategory: categoryFromContext,
    currentDeckName: deckFromContext,
    setAppMessage,
    updateCardImagePath,
    activeForm,
}) {
    const { imagePort, imageCompressionService, mediaVariant, isLandingDemoMedia } = useStudyMediaContext();
    const { category: currentCategory, deck: currentDeckName } = resolveStudyMediaNamespace(
        mediaVariant,
        categoryFromContext,
        deckFromContext,
    );
    const { user, isAuthenticated, loading: authLoading } = useAuth();
    const {
        demoImagePromptExtraRef,
        imagePromptApplySignal = 0,
    } = useFlashcardContext() ?? {};
    const [isImageLoading, setIsImageLoading] = useState(true);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [imageUrl, setImageUrl] = useState(null);
    const [currentDefIndex, setCurrentDefIndex] = useState(0);
    const imageRef = useRef(null);
    const imageAttempts = useRef({});
    const activeGenerations = useRef({});
    const generatingUiTimerRef = useRef(null);

    const loadSeqRef = useRef(0);
    const currentDefIndexRef = useRef(0);
    const displayedFormRef = useRef('v1');
    const imageUrlRef = useRef(null);
    const confirmedPathRef = useRef(null);
    const isTransitioningRef = useRef(false);
    /** Ref siempre actualizado con activeForm — permite leer el valor actual en closures de efectos */
    const activeFormRef = useRef(activeForm);
    activeFormRef.current = activeForm;

    const getActiveDefinitions = useCallback(() => {
        if (!cardData) return [];
        const getter = FORM_DEF_MAP[activeForm] || FORM_DEF_MAP.v1;
        return getter(cardData);
    }, [cardData, activeForm]);

    const isLandingDemo = isLandingDemoMedia || isLandingDemoCategory(currentCategory);
    const canGenerateImages = isLandingDemo
        || user?.role === 'premium'
        || user?.role === 'admin';
    const canDeleteImages = isLandingDemo
        || user?.role === 'premium'
        || user?.role === 'admin';
    const canCustomizeImages = !isLandingDemo
        && (user?.role === 'premium' || user?.role === 'admin');

    const clearGeneratingUiTimer = useCallback(() => {
        if (generatingUiTimerRef.current) {
            clearTimeout(generatingUiTimerRef.current);
            generatingUiTimerRef.current = null;
        }
    }, []);

    const waitForGenerationSlot = useCallback((genKey, isStale) => new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
            if (!activeGenerations.current[genKey] || isStale() || Date.now() - started > GEN_SLOT_WAIT_MS) {
                resolve();
                return;
            }
            setTimeout(tick, GEN_SLOT_POLL_MS);
        };
        tick();
    }), []);

    const releasePipelineLoading = useCallback((seq) => {
        if (loadSeqRef.current !== seq) return;
        setIsImageLoading(false);
        setIsGeneratingImage(false);
        isTransitioningRef.current = false;
        clearGeneratingUiTimer();
    }, [clearGeneratingUiTimer]);

    const buildGlobalFallbackPath = useCallback((defIndex, formOverride) => {
        const form = formOverride ?? activeForm;
        if (!cardData) return null;

        const getter = FORM_DEF_MAP[form] || FORM_DEF_MAP.v1;
        const defs = getter(cardData);
        const definition = defs?.[defIndex];

        if (definition?.imagePath) {
            const jsonPath = imagePort.normalizeToAvif(definition.imagePath);
            if (isLandingDemo && !pathMatchesVerbForm(jsonPath, form)) {
                return imagePort.buildGlobalStoragePath({
                    category: currentCategory,
                    deck: currentDeckName,
                    index: cardData.id,
                    defIndex,
                    form,
                });
            }
            return jsonPath;
        }
        if (currentCategory && currentDeckName) {
            return imagePort.buildGlobalStoragePath({
                category: currentCategory,
                deck: currentDeckName,
                index: cardData.id,
                defIndex,
                form,
            });
        }
        return null;
    }, [cardData, currentCategory, currentDeckName, activeForm, isLandingDemo, imagePort]);

    const applyLoadedImage = useCallback((url, path, defIndex, form) => {
        if (form !== activeFormRef.current) return;
        confirmedPathRef.current = path;
        imageUrlRef.current = url;
        displayedFormRef.current = form;
        setCurrentDefIndex(defIndex);
        currentDefIndexRef.current = defIndex;
        setImageUrl(url);
        setIsImageLoading(false);
        setIsGeneratingImage(false);
        isTransitioningRef.current = false;
        clearGeneratingUiTimer();
    }, [clearGeneratingUiTimer]);

    const setImageFromPath = useCallback((path, defIndex, cacheBust = false, form) => {
        const normalizedPath = imagePort.normalizeToAvif(path);
        const url = imagePort.buildUrl(normalizedPath, cacheBust);
        applyLoadedImage(url, normalizedPath, defIndex, form);
        return true;
    }, [applyLoadedImage, imagePort]);

    const fetchViaGenerate = useCallback(async (defIndex, forceRegenerate, seq, pipelineForm) => {
        const requestForm = pipelineForm ?? activeFormRef.current;
        const formDefs = (FORM_DEF_MAP[requestForm] || FORM_DEF_MAP.v1)(cardData);
        if (!cardData || !formDefs?.[defIndex] || !currentCategory) return false;

        if (!AI_ENABLED || !canGenerateImages) {
            setIsImageLoading(false);
            setIsGeneratingImage(false);
            isTransitioningRef.current = false;
            return false;
        }

        const isRequestStale = () => loadSeqRef.current !== seq;

        const genKey = `${cardData.id}_${requestForm}_${defIndex}`;
        if (activeGenerations.current[genKey]) {
            await waitForGenerationSlot(genKey, isRequestStale);
            if (isRequestStale()) return false;
            if (
                imageUrlRef.current
                && displayedFormRef.current === requestForm
                && currentDefIndexRef.current === defIndex
            ) {
                return true;
            }
            if (activeGenerations.current[genKey]) return false;
        }
        activeGenerations.current[genKey] = true;

        if (!imageAttempts.current[genKey]) imageAttempts.current[genKey] = 0;
        if (imageAttempts.current[genKey] >= MAX_IMAGE_ATTEMPTS) {
            setAppMessage({ text: `Fallaron todos los intentos para imagen def ${defIndex + 1}`, isError: true });
            releasePipelineLoading(seq);
            delete activeGenerations.current[genKey];
            return false;
        }

        imageAttempts.current[genKey]++;
        setIsImageLoading(true);
        setIsGeneratingImage(false);
        setAppMessage({ text: `⏳ Obteniendo imagen (Def ${defIndex + 1})...`, isError: false });

        clearGeneratingUiTimer();
        generatingUiTimerRef.current = setTimeout(() => {
            if (!isRequestStale()) {
                setIsGeneratingImage(true);
        setAppMessage({
            text: isLandingDemo
                ? `⏳ Gemini — generando imagen (Def ${defIndex + 1})...`
                : `⏳ Generando imagen (Def ${defIndex + 1})...`,
            isError: false,
        });
            }
        }, GENERATING_UI_DELAY_MS);

        try {
            const def = formDefs[defIndex];
            const usageExample = def.usage_example;
            const sceneComplement = isLandingDemoCategory(currentCategory)
                ? demoSceneComplement(demoImagePromptExtraRef?.current)
                : undefined;
            const data = await imagePort.generate({
                category: currentCategory,
                deck: currentDeckName,
                index: cardData.id,
                defIndex,
                form: requestForm,
                prompt: usageExample,
                meaning: def.meaning,
                usageExample,
                sceneComplement,
                forceGeneration: forceRegenerate,
            });

            if (isRequestStale()) {
                releasePipelineLoading(seq);
                return false;
            }

            const normalizedPath = imagePort.normalizeToAvif(data.path);
            updateCardImagePath(cardData.id, normalizedPath, defIndex, requestForm);

            try {
                await imagePort.preloadImageWithRetry(normalizedPath, true);
            } catch (preloadErr) {
                if (isRequestStale()) {
                    releasePipelineLoading(seq);
                    return false;
                }
                console.warn('[img-gen] Precarga fallida tras generar, reintentando URL:', preloadErr);
            }

            if (isRequestStale()) {
                releasePipelineLoading(seq);
                return false;
            }

            setImageFromPath(normalizedPath, defIndex, true, requestForm);
            setAppMessage({ text: `Imagen (Def ${defIndex + 1}) lista`, isError: false });
            return true;

        } catch (err) {
            console.warn(`Error imagen def ${defIndex}:`, err);
            const isDisabled = err.message.includes('deshabilitada');

            if (isDisabled || imageAttempts.current[genKey] >= MAX_IMAGE_ATTEMPTS) {
                setAppMessage({
                    text: isDisabled ? err.message : `Error final al cargar imagen: ${err.message}`,
                    isError: !isDisabled,
                });
                releasePipelineLoading(seq);
            } else if (!isRequestStale()) {
                setTimeout(() => {
                    if (!isRequestStale()) {
                        fetchViaGenerate(defIndex, forceRegenerate, seq, requestForm);
                    }
                }, IMAGE_RETRY_DELAY);
                return 'retrying';
            } else {
                releasePipelineLoading(seq);
            }
            return false;
        } finally {
            clearGeneratingUiTimer();
            delete activeGenerations.current[genKey];
        }
    }, [
        cardData, currentCategory, currentDeckName, setAppMessage,
        updateCardImagePath, canGenerateImages, demoImagePromptExtraRef, imagePort, isLandingDemo,
        setImageFromPath, clearGeneratingUiTimer, waitForGenerationSlot,
        releasePipelineLoading,
    ]);

    const runEnsurePipeline = useCallback(async (defIndex, { forceRegenerate = false, formOverride } = {}) => {
        const pipelineForm = formOverride ?? activeFormRef.current;
        // Sincronizar ref antes de async: setActiveForm y ensureImageForForm van en la misma tick.
        if (formOverride) {
            activeFormRef.current = formOverride;
        }
        const seq = ++loadSeqRef.current;
        const isStale = () => loadSeqRef.current !== seq;

        const pipelineDefs = (FORM_DEF_MAP[pipelineForm] || FORM_DEF_MAP.v1)(cardData);
        if (!cardData || !pipelineDefs?.[defIndex] || !currentCategory) {
            setIsImageLoading(false);
            isTransitioningRef.current = false;
            return;
        }

        // Ya visible la misma frase Y la misma forma verbal (v1/v2/v3)
        if (
            !forceRegenerate
            && currentDefIndexRef.current === defIndex
            && displayedFormRef.current === pipelineForm
            && imageUrlRef.current
            && confirmedPathRef.current
        ) {
            setIsImageLoading(false);
            isTransitioningRef.current = false;
            return;
        }

        const contextChanged = displayedFormRef.current !== pipelineForm
            || currentDefIndexRef.current !== defIndex;

        isTransitioningRef.current = true;
        setCurrentDefIndex(defIndex);
        currentDefIndexRef.current = defIndex;

        setIsImageLoading(true);
        setIsGeneratingImage(false);
        clearGeneratingUiTimer();

        if (contextChanged) {
            setImageUrl(null);
            imageUrlRef.current = null;
            confirmedPathRef.current = null;
        }

        setAppMessage({ text: `⏳ Verificando imagen (Def ${defIndex + 1})...`, isError: false });

        const getFormDefs = (form) => (FORM_DEF_MAP[form] || FORM_DEF_MAP.v1)(cardData);

        const tryImmediateJsonPath = (form) => {
            const formDefs = getFormDefs(form);
            if (!formDefs?.[defIndex]?.imagePath) return false;

            const jsonPath = imagePort.normalizeToAvif(formDefs[defIndex].imagePath);
            if (isLandingDemo && !pathMatchesVerbForm(jsonPath, form)) return false;

            setImageFromPath(jsonPath, defIndex, cardData.force_generation, form);
            setAppMessage({ text: `Imagen (Def ${defIndex + 1}) lista`, isError: false });
            return true;
        };

        const tryResolveForm = async (form) => {
            const isLandingDemoResolve = isLandingDemoCategory(currentCategory);
            if ((!isAuthenticated && !isLandingDemoResolve) || !currentCategory || !currentDeckName) return false;
            try {
                const data = await imagePort.resolve({
                    category: currentCategory,
                    deck: currentDeckName,
                    index: cardData.id,
                    defIndex,
                    form: form && form !== 'v1' ? form : undefined,
                });
                if (isStale()) {
                    isTransitioningRef.current = false;
                    return false;
                }
                if (data?.path) {
                    const resolvedPath = imagePort.normalizeToAvif(data.path);
                    if (isLandingDemo && !pathMatchesVerbForm(resolvedPath, form)) return false;
                    setImageFromPath(resolvedPath, defIndex, cardData.force_generation, form);
                    setAppMessage({ text: `Imagen (Def ${defIndex + 1}) lista`, isError: false });
                    return true;
                }
            } catch (err) {
                if (isStale()) {
                    isTransitioningRef.current = false;
                    return false;
                }
                const isNotFound = err.message?.includes('404') || err.message?.includes('no encontrada');
                if (!isNotFound) {
                    console.warn('[ensureImage] resolve falló:', err.message);
                }
            }
            return false;
        };

        const tryVerifyPath = async (path, form = pipelineForm) => {
            if (!path) return false;
            const accessible = await imagePort.verifyAccessible(path, cardData.force_generation);
            if (isStale()) {
                isTransitioningRef.current = false;
                return false;
            }
            if (accessible) {
                setImageFromPath(path, defIndex, cardData.force_generation, form);
                setAppMessage({ text: `Imagen (Def ${defIndex + 1}) lista`, isError: false });
                return true;
            }
            return false;
        };

        if (!forceRegenerate) {
            // Si la tarjeta ya trae imagePath, pintamos directo sin esperar roundtrip extra.
            if (tryImmediateJsonPath(pipelineForm)) return;
            // Con auth: resolver v2/v3 en Oracle antes de reutilizar imagePath v1 del JSON.
            if (!isLandingDemo && isAuthenticated && pipelineForm !== 'v1') {
                if (await tryResolveForm(pipelineForm)) return;
            }
            // App interna: v2/v3 pueden reutilizar imagen v1. Demo landing: cada tiempo es independiente.
            if (!isLandingDemo && pipelineForm !== 'v1' && tryImmediateJsonPath('v1')) return;

            if (!isLandingDemo && (await tryResolveForm(pipelineForm))) return;

            if (!isLandingDemo) {
                // Sin auth o resolve falló: probar v1 por JSON o ruta canónica
                if (pipelineForm !== 'v1') {
                    const v1Defs = getFormDefs('v1');
                    const v1Path = v1Defs?.[defIndex]?.imagePath
                        ? imagePort.normalizeToAvif(v1Defs[defIndex].imagePath)
                        : imagePort.buildGlobalStoragePath({
                            category: currentCategory,
                            deck: currentDeckName,
                            index: cardData.id,
                            defIndex,
                            form: 'v1',
                        });
                    if (await tryVerifyPath(v1Path, 'v1')) return;
                } else {
                    const v1Path = buildGlobalFallbackPath(defIndex, 'v1');
                    if (await tryVerifyPath(v1Path, 'v1')) return;
                }
            } else {
                // Demo landing: resolve en servidor (Oracle/local) antes del preload en navegador
                if (await tryResolveForm(pipelineForm)) return;
                const ownPath = buildGlobalFallbackPath(defIndex, pipelineForm);
                if (await tryVerifyPath(ownPath, pipelineForm)) return;
            }
        }

        if (isStale()) {
            isTransitioningRef.current = false;
            setIsImageLoading(false);
            return;
        }

        // Paso 3: get-or-generate (solo si no existe ninguna variante)
        if (canGenerateImages && AI_ENABLED) {
            const generated = await fetchViaGenerate(defIndex, forceRegenerate, seq, pipelineForm);
            if (generated === false && !isStale()) {
                releasePipelineLoading(seq);
            }
            return;
        }

        setImageUrl(null);
        imageUrlRef.current = null;
        confirmedPathRef.current = null;
        setIsImageLoading(false);
        setIsGeneratingImage(false);
        isTransitioningRef.current = false;
    }, [
        cardData, currentCategory, currentDeckName, isAuthenticated,
        buildGlobalFallbackPath, isLandingDemo,
        canGenerateImages, setImageFromPath, fetchViaGenerate, setAppMessage,
        clearGeneratingUiTimer, imagePort, releasePipelineLoading,
    ]);

    const ensureImageForDefinition = useCallback(async (defIndex, options = {}) => {
        if (authLoading) return;
        await runEnsurePipeline(defIndex, options);
    }, [authLoading, runEnsurePipeline]);

    const ensureImageForForm = useCallback((formKey, defIndex = 0, options = {}) => {
        if (authLoading) return;
        void runEnsurePipeline(defIndex, { ...options, formOverride: formKey });
    }, [authLoading, runEnsurePipeline]);

    const displayImageForIndex = useCallback((defIndex) => {
        ensureImageForDefinition(defIndex);
    }, [ensureImageForDefinition]);

    const handleImageError = useCallback(() => {
        if (isTransitioningRef.current) return;

        const defIndex = currentDefIndexRef.current;
        const path = confirmedPathRef.current;
        if (!path) return;

        const retryKey = path.split('?')[0];
        if (!imageAttempts.current[`retry_${retryKey}`]) {
            imageAttempts.current[`retry_${retryKey}`] = 1;
            setImageFromPath(path, defIndex, true, activeFormRef.current);
            setAppMessage({ text: `Reintentando imagen (Def ${defIndex + 1})...`, isError: false });
            return;
        }

        confirmedPathRef.current = null;
        imageUrlRef.current = null;
        ensureImageForDefinition(defIndex, { forceRegenerate: false });
    }, [setImageFromPath, ensureImageForDefinition, setAppMessage]);

    const prevCardIdRef = useRef(null);

    useEffect(() => {
        if (!cardData) return;
        if (prevCardIdRef.current === cardData.id) return;

        prevCardIdRef.current = cardData.id;
        loadSeqRef.current += 1;
        setIsImageLoading(true);
        setIsGeneratingImage(false);
        setImageUrl(null);
        imageUrlRef.current = null;
        confirmedPathRef.current = null;
        activeGenerations.current = {};
        currentDefIndexRef.current = 0;
        displayedFormRef.current = activeFormRef.current; // Bug 3: usar el form activo real, no hardcoded 'v1'
        isTransitioningRef.current = false;
        clearGeneratingUiTimer();
    }, [cardData, clearGeneratingUiTimer]);

    const prevFormContextRef = useRef({ form: activeForm, cardId: cardData?.id });

    useEffect(() => {
        if (!cardData) return;
        const prev = prevFormContextRef.current;
        if (prev.form === activeForm && prev.cardId === cardData.id) return;
        prevFormContextRef.current = { form: activeForm, cardId: cardData.id };

        setImageUrl(null);
        imageUrlRef.current = null;
        confirmedPathRef.current = null;
        displayedFormRef.current = '';
        setIsImageLoading(true);
        setIsGeneratingImage(false);
        isTransitioningRef.current = true;
        clearGeneratingUiTimer();
    }, [activeForm, cardData, clearGeneratingUiTimer]);

    const ensureImageRef = useRef(ensureImageForDefinition);
    ensureImageRef.current = ensureImageForDefinition;

    const imageBootstrapRef = useRef({
        cardId: null,
        form: null,
        category: null,
        deck: null,
        authReady: false,
    });

    useEffect(() => {
        if (authLoading || !cardData || !currentCategory) return;

        const snapshot = {
            cardId: cardData.id,
            form: activeForm,
            category: currentCategory,
            deck: currentDeckName,
            authReady: true,
        };
        const prev = imageBootstrapRef.current;
        const shouldBootstrap =
            prev.cardId !== snapshot.cardId
            || prev.form !== snapshot.form
            || prev.category !== snapshot.category
            || prev.deck !== snapshot.deck
            || !prev.authReady;

        if (!shouldBootstrap) return;

        imageBootstrapRef.current = snapshot;
        ensureImageRef.current(0);
    }, [authLoading, cardData?.id, currentCategory, currentDeckName, activeForm]);

    const prevApplySignalRef = useRef(0);
    useEffect(() => {
        if (!isLandingDemoCategory(currentCategory)) return;
        if (!imagePromptApplySignal || imagePromptApplySignal === prevApplySignalRef.current) return;
        prevApplySignalRef.current = imagePromptApplySignal;
        if (authLoading || !cardData) return;

        const defIndex = currentDefIndexRef.current;
        const genKey = `${cardData.id}_${activeFormRef.current}_${defIndex}`;
        imageAttempts.current[genKey] = 0;
        loadSeqRef.current += 1;
        confirmedPathRef.current = null;
        imageUrlRef.current = null;
        setImageUrl(null);
        ensureImageForDefinition(defIndex, { forceRegenerate: true });
    }, [imagePromptApplySignal, currentCategory, authLoading, cardData, ensureImageForDefinition]);

    useEffect(() => () => clearGeneratingUiTimer(), [clearGeneratingUiTimer]);

    // Demo landing: reintentar si el backend aún no estaba listo al montar
    useEffect(() => {
        if (!isLandingDemo || authLoading || !cardData || !currentCategory) return undefined;
        if (imageUrlRef.current || isImageLoading || isGeneratingImage) return undefined;

        const timer = setTimeout(() => {
            if (!imageUrlRef.current && !isTransitioningRef.current) {
                ensureImageForDefinition(currentDefIndexRef.current);
            }
        }, 4000);

        return () => clearTimeout(timer);
    }, [
        isLandingDemo,
        authLoading,
        cardData,
        currentCategory,
        isImageLoading,
        isGeneratingImage,
        ensureImageForDefinition,
    ]);

    const deleteImage = useCallback(async () => {
        const activeDefs = getActiveDefinitions();
        const defIndex = currentDefIndexRef.current;
        if (!cardData || !activeDefs?.[defIndex] || !currentCategory || !currentDeckName) {
            setAppMessage({ text: 'Error: No se puede eliminar la imagen (datos incompletos)', isError: true });
            return;
        }

        const genKey = `${cardData.id}_${activeForm}_${defIndex}`;
        imageAttempts.current[genKey] = 0;
        setAppMessage({ text: 'Eliminando imagen...', isError: false });
        setIsImageLoading(true);
        setIsGeneratingImage(false);
        confirmedPathRef.current = null;
        clearGeneratingUiTimer();

        try {
            await imagePort.delete({
                category: currentCategory,
                deck: currentDeckName,
                index: cardData.id,
                defIndex,
                form: activeForm,
            });

            setImageUrl(null);
            imageUrlRef.current = null;
            updateCardImagePath(cardData.id, null, defIndex, activeForm);
            setAppMessage({ text: 'Imagen eliminada. Generando nueva versión...', isError: false });
            await ensureImageForDefinition(defIndex, { forceRegenerate: true });

        } catch (err) {
            if (err.message.includes('404') || err.message.includes('No se encontró')) {
                setImageUrl(null);
                imageUrlRef.current = null;
                updateCardImagePath(cardData.id, null, defIndex, activeForm);
                await ensureImageForDefinition(defIndex, { forceRegenerate: true });
            } else {
                console.error('Error al eliminar imagen:', err);
                setAppMessage({ text: `Error: ${err.message}`, isError: true });
                setIsImageLoading(false);
            }
        }
    }, [
        cardData, currentCategory, currentDeckName,
        setAppMessage, updateCardImagePath, ensureImageForDefinition, getActiveDefinitions, activeForm,
        clearGeneratingUiTimer, imagePort,
    ]);

    const uploadImage = useCallback(async (file) => {
        const defIndex = currentDefIndexRef.current;
        if (!file || !cardData || !currentCategory || !currentDeckName) {
            setAppMessage({ text: 'Error: Faltan datos para subir la imagen.', isError: true });
            return;
        }

        setAppMessage({ text: '⏳ Optimizando y comprimiendo imagen localmente (AVIF/WASM)...', isError: false });
        setIsImageLoading(true);
        setIsGeneratingImage(false);
        setImageUrl(null);
        imageUrlRef.current = null;
        confirmedPathRef.current = null;
        clearGeneratingUiTimer();

        try {
            if (!imageCompressionService) {
                throw new Error('Image upload is not available');
            }
            const compressedBlob = await imageCompressionService.compress(file);
            const compressedFile = new File([compressedBlob], 'upload.avif', { type: 'image/avif' });

            const data = await imagePort.upload(compressedFile, {
                category: currentCategory,
                deck: currentDeckName,
                cardIndex: cardData.id,
                defIndex,
                form: activeForm,
            });

            const path = imagePort.normalizeToAvif(data.path);
            updateCardImagePath(cardData.id, path, defIndex, activeForm);
            setImageFromPath(path, defIndex, true, activeFormRef.current);
            setAppMessage({ text: '✅ Imagen personal guardada (solo visible para ti).', isError: false });

        } catch (err) {
            console.error('Error al subir imagen:', err);
            setAppMessage({ text: `Error al subir: ${err.message}`, isError: true });
            setImageUrl(null);
            imageUrlRef.current = null;
        } finally {
            setIsImageLoading(false);
            setIsGeneratingImage(false);
        }
    }, [
        cardData, currentCategory, currentDeckName,
        setAppMessage, updateCardImagePath, activeForm, setImageFromPath, clearGeneratingUiTimer,
        imageCompressionService, imagePort,
    ]);

    return {
        isImageLoading,
        isGeneratingImage,
        imageUrl,
        imageRef,
        currentDefIndex,
        displayImageForIndex,
        ensureImageForDefinition,
        ensureImageForForm,
        deleteImage,
        uploadImage,
        handleImageError,
        canCustomizeImages,
        canDeleteImages,
    };
}
