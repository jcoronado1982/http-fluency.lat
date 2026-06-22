import { useState, useCallback, useRef } from 'react';
import { audioRepository } from '../../repositories/audioRepository';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY  = 5000;
const SYNC_OFFSET  = 0.15;

const audioPlayer = new Audio();

function getPlaybackDuration(player) {
    const duration = player.duration;
    if (Number.isFinite(duration) && duration > 0) return duration;
    // Safari/iOS a menudo devuelve Infinity en WAV; usar rangos seekable/buffered
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

export function useAudioPlayback({
    setAppMessage,
    setIsAudioLoading,
    currentCategory,
    currentDeckName,
    verbName,
}) {
    const [isAudioPlaying,    setIsAudioPlaying]    = useState(false);
    const [activeAudioText,   setActiveAudioText]   = useState(null);
    const [activeVoiceName,   setActiveVoiceName]   = useState(null);
    const [highlightedWordIndex, setHighlightedWordIndex] = useState(-1);
    const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
    const playbackRequestIdRef = useRef(0);

    const stopAudio = useCallback(() => {
        playbackRequestIdRef.current += 1;
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        if (audioPlayer.src.startsWith('blob:')) URL.revokeObjectURL(audioPlayer.src);
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

    const playAudio = useCallback(async (originalText, lang = 'en', excludeVoice = null, forceRegenerate = false) => {
        if (!originalText || !currentCategory) return;

        const finalVerbName = currentDeckName === 'phonics' ? originalText : verbName;

        stopAudio();
        const playbackRequestId = playbackRequestIdRef.current;

        setHighlightedWordIndex(-1);
        setActiveAudioText(originalText);
        setIsAudioPlaying(true);
        setIsAudioLoading(true);
        setIsGeneratingAudio(true);

        let success = false;
        let data;
        let durationCleanup = null;

        try {
            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    setAppMessage({ text: `⏳ Verificando audio... (${attempt}/${MAX_ATTEMPTS})`, isError: false });

                    data = await audioRepository.synthesize({
                        category: currentCategory,
                        deck: currentDeckName,
                        text: originalText,
                        verbName: finalVerbName,
                        lang,
                        excludeVoice,
                        forceRegenerate,
                    });

                    success = true;
                    break;
                } catch (err) {
                    if (playbackRequestIdRef.current !== playbackRequestId) return;
                    if (attempt === MAX_ATTEMPTS) throw err;
                    setAppMessage({ text: `Reintentando audio... (${attempt}/${MAX_ATTEMPTS})`, isError: true });
                    await new Promise((r) => setTimeout(r, RETRY_DELAY));
                }
            }

            if (playbackRequestIdRef.current !== playbackRequestId) return;
            if (!success) throw new Error('No se pudo generar el audio.');

            const voiceLabel = data.voice_name || '—';
            setActiveVoiceName(voiceLabel);

            audioPlayer.pause();
            audioPlayer.removeAttribute('src');
            while (audioPlayer.firstChild) {
                audioPlayer.removeChild(audioPlayer.firstChild);
            }
            audioPlayer.load();

            const audioUrl = audioRepository.buildUrl(data.audio_url, true);
            const audioMime = audioUrl.endsWith('.wav') ? 'audio/wav' : 'audio/ogg';

            const source = document.createElement('source');
            source.src = audioUrl;
            source.type = audioMime;
            audioPlayer.appendChild(source);

            await new Promise((resolve, reject) => {
                const onReady = () => {
                    audioPlayer.removeEventListener('canplaythrough', onReady);
                    audioPlayer.removeEventListener('error', onError);
                    resolve();
                };
                const onError = () => {
                    audioPlayer.removeEventListener('canplaythrough', onReady);
                    audioPlayer.removeEventListener('error', onError);
                    reject(new Error('No se pudo cargar el audio'));
                };
                audioPlayer.addEventListener('canplaythrough', onReady);
                audioPlayer.addEventListener('error', onError);
                audioPlayer.load();
            });

            if (playbackRequestIdRef.current !== playbackRequestId) return;

            const words = originalText.trim().split(/\s+/);
            const wordLengths = words.map(w => w.replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g,"").length || 1);
            const totalChars = wordLengths.reduce((a, b) => a + b, 0);

            const SYNC_OFFSET_ADJUSTED = 0.02;

            const wordIntervals = [];
            let cumulativeFraction = 0;
            for (let i = 0; i < words.length; i++) {
                const weight = (wordLengths[i] + 1.2) / (totalChars + words.length * 1.2);
                const start = cumulativeFraction;
                const end = cumulativeFraction + weight;
                wordIntervals.push({ start, end });
                cumulativeFraction = end;
            }

            let animationFrameId = null;
            let cachedDuration = getPlaybackDuration(audioPlayer);
            let maxSeenTime = 0;
            const estimatedDuration = Math.max(0.8, words.length * 0.42);

            const syncDurationFromMetadata = () => {
                const d = getPlaybackDuration(audioPlayer);
                if (d) cachedDuration = d;
            };

            const cleanupDurationListeners = () => {
                audioPlayer.removeEventListener('durationchange', syncDurationFromMetadata);
                audioPlayer.removeEventListener('loadedmetadata', syncDurationFromMetadata);
                audioPlayer.removeEventListener('progress', syncDurationFromMetadata);
            };
            durationCleanup = cleanupDurationListeners;

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
                const idx = resolveWordIndex(
                    audioPlayer.currentTime,
                    duration,
                    wordIntervals,
                    SYNC_OFFSET_ADJUSTED
                );
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

            // timeupdate: fallback fiable en Safari/iOS cuando duration tarda o rAF se limita
            audioPlayer.ontimeupdate = updateHighlight;

            await audioPlayer.play();
            if (playbackRequestIdRef.current !== playbackRequestId) {
                stopAudio();
                return;
            }
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(trackHighlight);
            setAppMessage({ text: `▶️ Reproduciendo (voz: ${voiceLabel})...`, isError: false });

        } catch (err) {
            if (playbackRequestIdRef.current !== playbackRequestId) return;
            console.error('Error en playAudio:', err);
            durationCleanup?.();
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
    }, [stopAudio, setAppMessage, setIsAudioLoading, currentCategory, currentDeckName, verbName]);

    const deleteAudio = useCallback(async (textToDelete, lang = 'en') => {
        if (!textToDelete || !currentCategory) return;

        const finalVerbName = currentDeckName === 'phonics' ? textToDelete : verbName;

        try {
            setAppMessage({ text: '⏳ Actualizando voz (archivando audio anterior)...', isError: false });

            let previousVoice = null;
            try {
                const rotateResult = await audioRepository.rotate({
                    category: currentCategory,
                    deck: currentDeckName,
                    text: textToDelete,
                    verbName: finalVerbName,
                    lang,
                });
                previousVoice = rotateResult?.previous_voice || null;
            } catch (rotateErr) {
                const msg = rotateErr?.message || '';
                if (!msg.includes('404')) throw rotateErr;
            }

            setActiveVoiceName(null);
            setAppMessage({ text: '🎲 Generando nueva voz aleatoria...', isError: false });
            await playAudio(textToDelete, lang, previousVoice, true);
        } catch (err) {
            console.error('Error rotating audio:', err);
            setAppMessage({ text: `Error al actualizar voz: ${err.message}`, isError: true });
        }
    }, [currentCategory, currentDeckName, verbName, setAppMessage, playAudio]);

    return {
        playAudio,
        stopAudio,
        deleteAudio,
        isAudioPlaying,
        activeAudioText,
        activeVoiceName,
        highlightedWordIndex,
        isGeneratingAudio,
    };
}
