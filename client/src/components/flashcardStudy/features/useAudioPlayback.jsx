import { useState, useCallback, useEffect, useRef } from 'react';
import { useStudyMediaContext } from '../StudyMediaContext';
import { resolveStudyMediaNamespace } from '../../../contracts/studyMediaVariants';
import { useUIContext } from '../../../context/UIContext';
import { getCourseDirectionFromStudyLanguage } from '../../../modules/flashcards/useCases/deckUseCases';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY  = 5000;

const audioPlayer = new Audio();

function buildCacheKey(category, deck, text, lang, verbName) {
    return `${category}|${deck}|${text}|${lang}|${verbName ?? ''}`;
}

function getPlaybackDuration(player) {
    const duration = player.duration;
    if (Number.isFinite(duration) && duration > 0) return duration;
    for (const range of [player.seekable, player.buffered]) {
        if (range?.length > 0) {
            const end = range.end(range.length - 1);
            if (Number.isFinite(end) && end > 0) return end;
        }
    }
    return null;
}

function resolveWordIndex(currentTime, duration, wordIntervals, offset = 0.02) {
    if (!duration || wordIntervals.length === 0) return 0;
    const currentFraction = (currentTime + offset) / duration;
    let idx = 0;
    for (let i = 0; i < wordIntervals.length; i++) {
        if (currentFraction >= wordIntervals[i].start && currentFraction < wordIntervals[i].end) {
            return i;
        }
        if (i === wordIntervals.length - 1 && currentFraction >= wordIntervals[i].start) {
            idx = i;
        }
    }
    return idx;
}

function buildWordIntervals(originalText) {
    const words = originalText.trim().split(/\s+/);
    const wordLengths = words.map(w => w.replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, '').length || 1);
    const totalChars = wordLengths.reduce((a, b) => a + b, 0);
    const wordIntervals = [];
    let cumulativeFraction = 0;
    for (let i = 0; i < words.length; i++) {
        const weight = (wordLengths[i] + 1.2) / (totalChars + words.length * 1.2);
        const start = cumulativeFraction;
        const end = cumulativeFraction + weight;
        wordIntervals.push({ start, end });
        cumulativeFraction = end;
    }
    return { words, wordIntervals };
}

function waitForAudioReady(player) {
    return new Promise((resolve, reject) => {
        if (player.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
            resolve();
            return;
        }

        let settled = false;
        const finish = (ok) => {
            if (settled) return;
            settled = true;
            cleanup();
            ok ? resolve() : reject(new Error('No se pudo cargar el audio'));
        };

        const cleanup = () => {
            player.removeEventListener('canplay', onReady);
            player.removeEventListener('loadeddata', onReady);
            player.removeEventListener('error', onError);
        };

        const onReady = () => finish(true);
        const onError = () => finish(false);

        player.addEventListener('canplay', onReady);
        player.addEventListener('loadeddata', onReady);
        player.addEventListener('error', onError);
        player.load();
    });
}

async function fetchAudioBlob(resolvedUrl) {
    const res = await fetch(resolvedUrl, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return URL.createObjectURL(await res.blob());
}

export function useAudioPlayback({
    setAppMessage,
    setIsAudioLoading,
    currentCategory: categoryFromContext,
    currentDeckName: deckFromContext,
    verbName,
}) {
    const { audioPort, mediaVariant, isLandingDemoMedia } = useStudyMediaContext();
    const { studyLanguage = 'en' } = useUIContext();
    const { category: currentCategory, deck: currentDeckName } = resolveStudyMediaNamespace(
        mediaVariant,
        categoryFromContext,
        deckFromContext,
    );
    const courseDirection = getCourseDirectionFromStudyLanguage(studyLanguage);
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const [activeAudioText, setActiveAudioText] = useState(null);
    const [activeVoiceName, setActiveVoiceName] = useState(null);
    const [highlightedWordIndex, setHighlightedWordIndex] = useState(-1);
    const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
    const playbackRequestIdRef = useRef(0);
    const sessionCacheRef = useRef(new Map());
    const prefetchInFlightRef = useRef(new Set());

    const revokeBlobUrl = useCallback((blobUrl) => {
        if (blobUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(blobUrl);
        }
    }, []);

    const invalidateCacheEntry = useCallback((key) => {
        const entry = sessionCacheRef.current.get(key);
        if (entry?.blobUrl) revokeBlobUrl(entry.blobUrl);
        sessionCacheRef.current.delete(key);
    }, [revokeBlobUrl]);

    const stopAudio = useCallback(() => {
        playbackRequestIdRef.current += 1;
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        // Los blob: pertenecen a sessionCacheRef y deben seguir válidos para
        // poder reproducir el mismo audio nuevamente. Se revocan al invalidar
        // la entrada o al desmontar este hook, no al detener cada reproducción.
        audioPlayer.removeAttribute('src');
        while (audioPlayer.firstChild) {
            audioPlayer.removeChild(audioPlayer.firstChild);
        }
        audioPlayer.load();
        audioPlayer.ontimeupdate = null;
        audioPlayer.onplay = null;
        audioPlayer.onpause = null;
        audioPlayer.onended = null;
        setIsAudioPlaying(false);
        setActiveAudioText(null);
        setActiveVoiceName(null);
        setHighlightedWordIndex(-1);
        setIsAudioLoading(false);
        setIsGeneratingAudio(false);
    }, [setIsAudioLoading]);

    useEffect(() => () => {
        const cachedBlobUrls = new Set();
        for (const entry of sessionCacheRef.current.values()) {
            if (entry?.blobUrl) cachedBlobUrls.add(entry.blobUrl);
        }

        if (cachedBlobUrls.has(audioPlayer.src)) {
            audioPlayer.pause();
            audioPlayer.removeAttribute('src');
            audioPlayer.load();
        }

        for (const blobUrl of cachedBlobUrls) revokeBlobUrl(blobUrl);
        sessionCacheRef.current.clear();
    }, [revokeBlobUrl]);

    const warmSessionCache = useCallback(async (key, resolvedUrl, voiceName) => {
        const existing = sessionCacheRef.current.get(key);
        if (existing?.blobUrl) return existing;

        const entry = { resolvedUrl, voiceName, blobUrl: existing?.blobUrl ?? null };
        sessionCacheRef.current.set(key, entry);

        try {
            const blobUrl = await fetchAudioBlob(resolvedUrl);
            const current = sessionCacheRef.current.get(key);
            if (current?.blobUrl && current.blobUrl !== blobUrl) {
                revokeBlobUrl(current.blobUrl);
            }
            sessionCacheRef.current.set(key, { ...entry, blobUrl });
            return sessionCacheRef.current.get(key);
        } catch (err) {
            console.warn('Audio prefetch failed:', err);
            return entry;
        }
    }, [revokeBlobUrl]);

    const resolveAudioSource = useCallback(async ({
        key,
        originalText,
        lang,
        finalVerbName,
        excludeVoice,
        forceRegenerate,
        silent = false,
    }) => {
        if (!forceRegenerate) {
            const cached = sessionCacheRef.current.get(key);
            if (cached?.blobUrl) {
                return { playbackUrl: cached.blobUrl, voiceName: cached.voiceName, fromCache: true };
            }
            if (cached?.resolvedUrl) {
                return { playbackUrl: cached.resolvedUrl, voiceName: cached.voiceName, fromCache: true };
            }
        } else {
            invalidateCacheEntry(key);
        }

        let data;
        const fetchResolved = async () => {
            if (forceRegenerate) {
                return audioPort.synthesize({
                    category: currentCategory,
                    deck: currentDeckName,
                    text: originalText,
                    verbName: finalVerbName,
                    lang,
                    courseDirection,
                    excludeVoice,
                    forceRegenerate: true,
                });
            }

            try {
                return await audioPort.resolve({
                    category: currentCategory,
                    deck: currentDeckName,
                    text: originalText,
                    verbName: finalVerbName,
                    lang,
                    courseDirection,
                });
            } catch (err) {
                const is404 = String(err?.message || '').includes('404');
                if (!is404) throw err;
                return audioPort.synthesize({
                    category: currentCategory,
                    deck: currentDeckName,
                    text: originalText,
                    verbName: finalVerbName,
                    lang,
                    courseDirection,
                    excludeVoice,
                    forceRegenerate: false,
                });
            }
        };

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                if (!silent) {
                    setAppMessage({
                        text: forceRegenerate
                            ? `⏳ Generando audio... (${attempt}/${MAX_ATTEMPTS})`
                            : `⏳ Cargando audio... (${attempt}/${MAX_ATTEMPTS})`,
                        isError: false,
                    });
                }

                data = await fetchResolved();
                break;
            } catch (err) {
                if (attempt === MAX_ATTEMPTS) throw err;
                if (!silent) {
                    setAppMessage({ text: `Reintentando audio... (${attempt}/${MAX_ATTEMPTS})`, isError: true });
                }
                await new Promise((r) => setTimeout(r, RETRY_DELAY));
            }
        }

        const voiceName = data.voice_name || '—';
        const resolvedUrl = audioPort.buildUrl(data.audio_url, forceRegenerate || !data.from_cache);
        sessionCacheRef.current.set(key, { resolvedUrl, voiceName, blobUrl: null });

        if (data.from_cache && !forceRegenerate) {
            // No bloqueamos la reproducción esperando el blob completo.
            void warmSessionCache(key, resolvedUrl, voiceName);
        }

        return { playbackUrl: resolvedUrl, voiceName, fromCache: !!data.from_cache };
    }, [audioPort, courseDirection, currentCategory, currentDeckName, invalidateCacheEntry, setAppMessage, warmSessionCache]);

    const startPlayback = useCallback(async (originalText, playbackUrl, voiceLabel, playbackRequestId) => {
        const { wordIntervals } = buildWordIntervals(originalText);

        audioPlayer.pause();
        audioPlayer.removeAttribute('src');
        while (audioPlayer.firstChild) {
            audioPlayer.removeChild(audioPlayer.firstChild);
        }
        audioPlayer.load();

        // Dejar que el navegador use el Content-Type real de la respuesta (o del
        // Blob). Forzar audio/ogg rompía los MP3 del landing y los blob: cacheados
        // no conservan una extensión desde la que podamos inferir el formato.
        audioPlayer.src = playbackUrl;

        await waitForAudioReady(audioPlayer);
        if (playbackRequestIdRef.current !== playbackRequestId) return false;

        let animationFrameId = null;
        let cachedDuration = getPlaybackDuration(audioPlayer);
        let maxSeenTime = 0;
        const estimatedDuration = Math.max(0.8, wordIntervals.length * 0.42);

        const syncDurationFromMetadata = () => {
            const d = getPlaybackDuration(audioPlayer);
            if (d) cachedDuration = d;
        };

        const cleanupDurationListeners = () => {
            audioPlayer.removeEventListener('durationchange', syncDurationFromMetadata);
            audioPlayer.removeEventListener('loadedmetadata', syncDurationFromMetadata);
            audioPlayer.removeEventListener('progress', syncDurationFromMetadata);
        };

        audioPlayer.addEventListener('durationchange', syncDurationFromMetadata);
        audioPlayer.addEventListener('loadedmetadata', syncDurationFromMetadata);
        audioPlayer.addEventListener('progress', syncDurationFromMetadata);

        const resolveDuration = () => {
            cachedDuration = getPlaybackDuration(audioPlayer) ?? cachedDuration;
            maxSeenTime = Math.max(maxSeenTime, audioPlayer.currentTime || 0);
            return cachedDuration ?? Math.max(maxSeenTime * 1.08, estimatedDuration);
        };

        const updateHighlight = () => {
            const duration = resolveDuration();
            if (!duration || duration <= 0) return;
            const idx = resolveWordIndex(audioPlayer.currentTime, duration, wordIntervals, 0.02);
            setHighlightedWordIndex((p) => (p !== idx ? idx : p));
        };

        const trackHighlight = () => {
            if (!audioPlayer.paused) {
                updateHighlight();
                animationFrameId = requestAnimationFrame(trackHighlight);
            }
        };

        audioPlayer.onplay = () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(trackHighlight);
        };

        audioPlayer.onpause = () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
        };

        audioPlayer.onended = () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            cleanupDurationListeners();
            audioPlayer.ontimeupdate = null;
            setIsAudioPlaying(false);
            setAppMessage({ text: 'Audio finalizado.', isError: false });
            setHighlightedWordIndex(-1);
            setActiveAudioText(null);
            setIsAudioLoading(false);
        };

        audioPlayer.ontimeupdate = updateHighlight;

        await audioPlayer.play();
        if (playbackRequestIdRef.current !== playbackRequestId) {
            cleanupDurationListeners();
            return false;
        }

        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(trackHighlight);
        setAppMessage({
            text: isLandingDemoMedia
                ? `▶️ ElevenLabs (voz: ${voiceLabel})...`
                : `▶️ Reproduciendo (voz: ${voiceLabel})...`,
            isError: false,
        });
        return true;
    }, [setAppMessage, setIsAudioLoading, isLandingDemoMedia]);

    const playAudio = useCallback(async (originalText, lang = 'en', excludeVoice = null, forceRegenerate = false) => {
        if (!originalText || !currentCategory) return;

        const finalVerbName = currentDeckName === 'phonics' ? originalText : verbName;
        const key = buildCacheKey(currentCategory, currentDeckName, originalText, lang, finalVerbName);

        stopAudio();
        const playbackRequestId = playbackRequestIdRef.current;

        setHighlightedWordIndex(-1);
        setActiveAudioText(originalText);
        setIsAudioPlaying(true);
        setIsAudioLoading(true);
        setIsGeneratingAudio(true);

        try {
            const { playbackUrl, voiceName, fromCache } = await resolveAudioSource({
                key,
                originalText,
                lang,
                finalVerbName,
                excludeVoice,
                forceRegenerate,
            });

            if (playbackRequestIdRef.current !== playbackRequestId) return;

            setActiveVoiceName(voiceName);

            if (fromCache) {
                setAppMessage({ text: '▶️ Reproduciendo audio...', isError: false });
            }

            const played = await startPlayback(originalText, playbackUrl, voiceName, playbackRequestId);
            if (!played) stopAudio();

            if (!fromCache && playbackUrl && !playbackUrl.startsWith('blob:')) {
                void warmSessionCache(key, playbackUrl, voiceName);
            }
        } catch (err) {
            if (playbackRequestIdRef.current !== playbackRequestId) return;
            console.error('Error en playAudio:', err);
            audioPlayer.ontimeupdate = null;
            setAppMessage({ text: `Error: ${err.message}`, isError: true });
            setIsAudioPlaying(false);
            setActiveAudioText(null);
            setActiveVoiceName(null);
            setHighlightedWordIndex(-1);
            setIsAudioLoading(false);
        } finally {
            if (playbackRequestIdRef.current === playbackRequestId) {
                setIsGeneratingAudio(false);
            }
        }
    }, [
        currentCategory,
        currentDeckName,
        verbName,
        stopAudio,
        resolveAudioSource,
        startPlayback,
        warmSessionCache,
        setAppMessage,
        setIsAudioLoading,
    ]);

    const prefetchAudio = useCallback(async (originalText, lang = 'en', verbNameOverride = null) => {
        if (!originalText || !currentCategory) return;

        const finalVerbName = currentDeckName === 'phonics'
            ? originalText
            : (verbNameOverride ?? verbName);
        const key = buildCacheKey(currentCategory, currentDeckName, originalText, lang, finalVerbName);

        const cached = sessionCacheRef.current.get(key);
        if (cached?.blobUrl || prefetchInFlightRef.current.has(key)) return;

        prefetchInFlightRef.current.add(key);
        try {
            const { playbackUrl, voiceName } = await resolveAudioSource({
                key,
                originalText,
                lang,
                finalVerbName,
                excludeVoice: null,
                forceRegenerate: false,
                silent: true,
            });
            if (playbackUrl && !playbackUrl.startsWith('blob:')) {
                await warmSessionCache(key, playbackUrl, voiceName);
            }
        } catch {
            // Prefetch silencioso: no bloquear la UI
        } finally {
            prefetchInFlightRef.current.delete(key);
        }
    }, [currentCategory, currentDeckName, verbName, resolveAudioSource, warmSessionCache]);

    const deleteAudio = useCallback(async (textToDelete, lang = 'en') => {
        if (!textToDelete || !currentCategory) return;

        const finalVerbName = currentDeckName === 'phonics' ? textToDelete : verbName;
        const key = buildCacheKey(currentCategory, currentDeckName, textToDelete, lang, finalVerbName);

        try {
            setAppMessage({ text: '⏳ Actualizando voz (archivando audio anterior)...', isError: false });

            let previousVoice = null;
            try {
                const rotateResult = await audioPort.rotate({
                    category: currentCategory,
                    deck: currentDeckName,
                    text: textToDelete,
                    verbName: finalVerbName,
                    lang,
                    courseDirection,
                });
                previousVoice = rotateResult?.previous_voice || null;
            } catch (rotateErr) {
                const msg = rotateErr?.message || '';
                if (!msg.includes('404')) throw rotateErr;
            }

            invalidateCacheEntry(key);
            setActiveVoiceName(null);
            setAppMessage({ text: '🎲 Generando nueva voz aleatoria...', isError: false });
            await playAudio(textToDelete, lang, previousVoice, true);
        } catch (err) {
            console.error('Error rotating audio:', err);
            setAppMessage({ text: `Error al actualizar voz: ${err.message}`, isError: true });
        }
    }, [audioPort, courseDirection, currentCategory, currentDeckName, verbName, setAppMessage, playAudio, invalidateCacheEntry]);

    return {
        playAudio,
        prefetchAudio,
        stopAudio,
        deleteAudio,
        isAudioPlaying,
        activeAudioText,
        activeVoiceName,
        highlightedWordIndex,
        isGeneratingAudio,
    };
}
