import { useState, useEffect, useCallback, useRef } from 'react';
import { imageRepository } from '../repositories/imageRepository';
import { imageCompressionService } from '../services/imageCompressionService';
import { AI_ENABLED } from '../../../config/api';
import { useAuth } from '../../../context/AuthContext';

const MAX_IMAGE_ATTEMPTS = 3;
const IMAGE_RETRY_DELAY = 5000;
const GENERATING_UI_DELAY_MS = 2500;

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

export function useImageGeneration({
    cardData,
    currentCategory,
    currentDeckName,
    setAppMessage,
    updateCardImagePath,
    activeForm,
}) {
    const { user, isAuthenticated, loading: authLoading } = useAuth();
    const [isImageLoading, setIsImageLoading] = useState(true);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [imageUrl, setImageUrl] = useState(null);
    const [, setCurrentDefIndex] = useState(0);
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

    const canGenerateImages = user?.role === 'premium' || user?.role === 'admin';

    const clearGeneratingUiTimer = useCallback(() => {
        if (generatingUiTimerRef.current) {
            clearTimeout(generatingUiTimerRef.current);
            generatingUiTimerRef.current = null;
        }
    }, []);

    const buildGlobalFallbackPath = useCallback((defIndex, formOverride) => {
        const form = formOverride ?? activeForm;
        if (!cardData) return null;

        const getter = FORM_DEF_MAP[form] || FORM_DEF_MAP.v1;
        const defs = getter(cardData);
        const definition = defs?.[defIndex];

        if (definition?.imagePath) {
            return imageRepository.normalizeToAvif(definition.imagePath);
        }
        if (currentCategory && currentDeckName) {
            return imageRepository.buildGlobalStoragePath({
                category: currentCategory,
                deck: currentDeckName,
                index: cardData.id,
                defIndex,
                form,
            });
        }
        return null;
    }, [cardData, currentCategory, currentDeckName, activeForm]);

    const applyLoadedImage = useCallback((url, path, defIndex, form = activeForm) => {
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
    }, [clearGeneratingUiTimer, activeForm]);

    const setImageFromPath = useCallback((path, defIndex, cacheBust = false, form = activeForm) => {
        const normalizedPath = imageRepository.normalizeToAvif(path);
        const url = imageRepository.buildUrl(normalizedPath, cacheBust);
        applyLoadedImage(url, normalizedPath, defIndex, form);
        return true;
    }, [applyLoadedImage, activeForm]);

    const fetchViaGenerate = useCallback(async (defIndex, forceRegenerate, seq) => {
        const activeDefs = getActiveDefinitions();
        if (!cardData || !activeDefs?.[defIndex] || !currentCategory) return false;

        if (!AI_ENABLED || !canGenerateImages) {
            setIsImageLoading(false);
            setIsGeneratingImage(false);
            isTransitioningRef.current = false;
            return false;
        }

        const genKey = `${cardData.id}_${activeForm}_${defIndex}`;
        if (activeGenerations.current[genKey]) return false;
        activeGenerations.current[genKey] = true;

        if (!imageAttempts.current[genKey]) imageAttempts.current[genKey] = 0;
        if (imageAttempts.current[genKey] >= MAX_IMAGE_ATTEMPTS) {
            setAppMessage({ text: `Fallaron todos los intentos para imagen def ${defIndex + 1}`, isError: true });
            setIsImageLoading(false);
            setIsGeneratingImage(false);
            isTransitioningRef.current = false;
            delete activeGenerations.current[genKey];
            return false;
        }

        imageAttempts.current[genKey]++;
        setIsImageLoading(true);
        setIsGeneratingImage(false);
        setAppMessage({ text: `⏳ Obteniendo imagen (Def ${defIndex + 1})...`, isError: false });

        clearGeneratingUiTimer();
        generatingUiTimerRef.current = setTimeout(() => {
            if (loadSeqRef.current === seq) {
                setIsGeneratingImage(true);
                setAppMessage({ text: `⏳ Generando imagen (Def ${defIndex + 1})...`, isError: false });
            }
        }, GENERATING_UI_DELAY_MS);

        try {
            const def = activeDefs[defIndex];
            const data = await imageRepository.generate({
                category: currentCategory,
                deck: currentDeckName,
                index: cardData.id,
                defIndex,
                form: activeForm,
                prompt: def.usage_example,
                meaning: def.meaning,
                usageExample: def.usage_example,
                forceGeneration: forceRegenerate,
            });

            if (seq !== undefined && loadSeqRef.current !== seq) return false;

            const normalizedPath = imageRepository.normalizeToAvif(data.path);
            updateCardImagePath(cardData.id, normalizedPath, defIndex, activeForm);
            setImageFromPath(normalizedPath, defIndex, true, activeForm); // Bug 1: pasar form explícitamente
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
                setIsImageLoading(false);
                setIsGeneratingImage(false);
                isTransitioningRef.current = false;
            } else if (seq === undefined || loadSeqRef.current === seq) {
                setTimeout(() => {
                    // Bug 4: evitar retry si el seq ya es stale (el usuario cambió de tarjeta/forma)
                    if (seq === undefined || loadSeqRef.current === seq) {
                        fetchViaGenerate(defIndex, forceRegenerate, seq);
                    }
                }, IMAGE_RETRY_DELAY);
            }
            return false;
        } finally {
            clearGeneratingUiTimer();
            delete activeGenerations.current[genKey];
        }
    }, [
        cardData, currentCategory, currentDeckName, setAppMessage,
        updateCardImagePath, getActiveDefinitions, activeForm, canGenerateImages,
        setImageFromPath, clearGeneratingUiTimer,
    ]);

    const runEnsurePipeline = useCallback(async (defIndex, { forceRegenerate = false } = {}) => {
        const seq = ++loadSeqRef.current;
        const isStale = () => loadSeqRef.current !== seq;

        const activeDefs = getActiveDefinitions();
        if (!cardData || !activeDefs?.[defIndex] || !currentCategory) {
            setIsImageLoading(false);
            isTransitioningRef.current = false;
            return;
        }

        // Ya visible la misma frase Y la misma forma verbal (v1/v2/v3)
        if (
            !forceRegenerate
            && currentDefIndexRef.current === defIndex
            && displayedFormRef.current === activeForm
            && imageUrlRef.current
            && confirmedPathRef.current
        ) {
            setIsImageLoading(false);
            isTransitioningRef.current = false;
            return;
        }

        const contextChanged = displayedFormRef.current !== activeForm
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

            const jsonPath = imageRepository.normalizeToAvif(formDefs[defIndex].imagePath);
            setImageFromPath(jsonPath, defIndex, cardData.force_generation, activeForm);
            setAppMessage({ text: `Imagen (Def ${defIndex + 1}) lista`, isError: false });
            return true;
        };

        const tryResolveForm = async (form) => {
            if (!isAuthenticated || !currentCategory || !currentDeckName) return false;
            try {
                const data = await imageRepository.resolve({
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
                    setImageFromPath(data.path, defIndex, cardData.force_generation, activeForm);
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

        const tryVerifyPath = async (path) => {
            if (!path) return false;
            const accessible = await imageRepository.verifyAccessible(path, cardData.force_generation);
            if (isStale()) {
                isTransitioningRef.current = false;
                return false;
            }
            if (accessible) {
                setImageFromPath(path, defIndex, cardData.force_generation, activeForm);
                setAppMessage({ text: `Imagen (Def ${defIndex + 1}) lista`, isError: false });
                return true;
            }
            return false;
        };

        if (!forceRegenerate) {
            // Si la tarjeta ya trae imagePath, pintamos directo sin esperar roundtrip extra.
            if (tryImmediateJsonPath(activeForm)) return;
            if (activeForm !== 'v1' && tryImmediateJsonPath('v1')) return;

            // resolve-image (backend hace fallback v1 para v2/v3 si no hay imagen propia)
            if (await tryResolveForm(activeForm)) return;

            // Sin auth o resolve falló: probar v1 por JSON o ruta canónica
            if (activeForm !== 'v1') {
                const v1Defs = getFormDefs('v1');
                const v1Path = v1Defs?.[defIndex]?.imagePath
                    ? imageRepository.normalizeToAvif(v1Defs[defIndex].imagePath)
                    : imageRepository.buildGlobalStoragePath({
                        category: currentCategory,
                        deck: currentDeckName,
                        index: cardData.id,
                        defIndex,
                        form: 'v1',
                    });
                if (await tryVerifyPath(v1Path)) return;
            } else {
                const v1Path = buildGlobalFallbackPath(defIndex, 'v1');
                if (await tryVerifyPath(v1Path)) return;
            }
        }

        if (isStale()) {
            isTransitioningRef.current = false;
            setIsImageLoading(false);
            return;
        }

        // Paso 3: get-or-generate (solo si no existe ninguna variante)
        if (canGenerateImages && AI_ENABLED) {
            await fetchViaGenerate(defIndex, forceRegenerate, seq);
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
        getActiveDefinitions, activeForm, buildGlobalFallbackPath,
        canGenerateImages, setImageFromPath, fetchViaGenerate, setAppMessage,
        clearGeneratingUiTimer,
    ]);

    const ensureImageForDefinition = useCallback(async (defIndex, options = {}) => {
        if (authLoading) return;
        await runEnsurePipeline(defIndex, options);
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
            setImageFromPath(path, defIndex, true);
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

    useEffect(() => {
        if (authLoading || !cardData || !currentCategory) return;
        ensureImageForDefinition(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, cardData?.id, currentCategory, currentDeckName, activeForm, isAuthenticated]);

    useEffect(() => () => clearGeneratingUiTimer(), [clearGeneratingUiTimer]);

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
            await imageRepository.delete({
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
        clearGeneratingUiTimer,
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
            const compressedBlob = await imageCompressionService.compress(file);
            const compressedFile = new File([compressedBlob], 'upload.avif', { type: 'image/avif' });

            const data = await imageRepository.upload(compressedFile, {
                category: currentCategory,
                deck: currentDeckName,
                cardIndex: cardData.id,
                defIndex,
                form: activeForm,
            });

            const path = imageRepository.normalizeToAvif(data.path);
            updateCardImagePath(cardData.id, path, defIndex, activeForm);
            setImageFromPath(path, defIndex, true);
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
    ]);

    return {
        isImageLoading,
        isGeneratingImage,
        imageUrl,
        imageRef,
        displayImageForIndex,
        ensureImageForDefinition,
        deleteImage,
        uploadImage,
        handleImageError,
        canCustomizeImages: canGenerateImages,
    };
}
