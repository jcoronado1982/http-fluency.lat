import { useState, useCallback } from 'react';
import { audioRepository } from '../../repositories/audioRepository';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY  = 5000;
const SYNC_OFFSET  = 0.15;

const audioPlayer = new Audio();

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

    const playAudio = useCallback(async (originalText, lang = 'en', excludeVoice = null, forceRegenerate = false) => {
        if (!originalText || !currentCategory) return;

        const finalVerbName = currentDeckName === 'phonics' ? originalText : verbName;

        if (isAudioPlaying && audioPlayer.src) {
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
            if (audioPlayer.src.startsWith('blob:')) URL.revokeObjectURL(audioPlayer.src);
        }

        setHighlightedWordIndex(-1);
        setActiveAudioText(originalText);
        setIsAudioPlaying(true);
        setIsAudioLoading(true);
        setIsGeneratingAudio(true);

        let success = false;
        let data;

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
                    if (attempt === MAX_ATTEMPTS) throw err;
                    setAppMessage({ text: `Reintentando audio... (${attempt}/${MAX_ATTEMPTS})`, isError: true });
                    await new Promise((r) => setTimeout(r, RETRY_DELAY));
                }
            }

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
            const trackHighlight = () => {
                if (!audioPlayer.paused) {
                    const { duration, currentTime } = audioPlayer;
                    if (duration && isFinite(duration)) {
                        const currentFraction = (currentTime + SYNC_OFFSET_ADJUSTED) / duration;
                        let idx = 0;
                        for (let i = 0; i < wordIntervals.length; i++) {
                            if (currentFraction >= wordIntervals[i].start && currentFraction < wordIntervals[i].end) {
                                idx = i;
                                break;
                            }
                            if (i === wordIntervals.length - 1 && currentFraction >= wordIntervals[i].start) {
                                idx = i;
                            }
                        }
                        setHighlightedWordIndex((p) => (p !== idx ? idx : p));
                    }
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
                setIsAudioPlaying(false);
                setAppMessage({ text: 'Audio finalizado.', isError: false });
                setHighlightedWordIndex(-1);
                setActiveAudioText(null);
                setIsAudioLoading(false);
            };

            audioPlayer.ontimeupdate = null;

            await audioPlayer.play();
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(trackHighlight);
            setAppMessage({ text: `▶️ Reproduciendo (voz: ${voiceLabel})...`, isError: false });

        } catch (err) {
            console.error('Error en playAudio:', err);
            setAppMessage({ text: `Error: ${err.message}`, isError: true });
            setIsAudioPlaying(false);
            setActiveAudioText(null);
            setActiveVoiceName(null);
            setHighlightedWordIndex(-1);
            setIsAudioLoading(false);
        } finally {
            setIsGeneratingAudio(false);
        }
    }, [isAudioPlaying, setAppMessage, setIsAudioLoading, currentCategory, currentDeckName, verbName]);

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
        deleteAudio,
        isAudioPlaying,
        activeAudioText,
        activeVoiceName,
        highlightedWordIndex,
        isGeneratingAudio,
    };
}
