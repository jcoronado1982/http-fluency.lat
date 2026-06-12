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
    selectedTone,
    verbName,
}) {
    const [isAudioPlaying,    setIsAudioPlaying]    = useState(false);
    const [activeAudioText,   setActiveAudioText]   = useState(null);
    const [highlightedWordIndex, setHighlightedWordIndex] = useState(-1);
    const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

    const playAudio = useCallback(async (originalText) => {
        if (!originalText || !currentCategory) return;

        const finalVerbName = currentDeckName === 'phonics' ? originalText : verbName;
        const tone = selectedTone?.trim().replace(/:$/, '') || '';

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

                    // DIP: delega al repositorio
                    data = await audioRepository.synthesize({
                        category: currentCategory,
                        deck: currentDeckName,
                        text: originalText,
                        tone,
                        verbName: finalVerbName,
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

            // Usamos forceCacheBust=true porque acabamos de llamar a la API para generar/obtener el audio,
            // asegurando que si lo acabamos de eliminar, el navegador no reproduzca la caché vieja.
            const audioUrl = audioRepository.buildUrl(data.audio_url, true);
            
            // Unificar origen y establecer el tipo MIME correcto (audio/ogg)
            while (audioPlayer.firstChild) {
                audioPlayer.removeChild(audioPlayer.firstChild);
            }
            const source = document.createElement('source');
            source.src = audioUrl;
            source.type = 'audio/ogg';
            audioPlayer.appendChild(source);

            // Esperar a que el archivo sea accesible antes de reproducir
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

            // Calcular pesos basados en la longitud de caracteres de cada palabra para aproximar el ritmo
            const words = originalText.trim().split(/\s+/);
            const wordLengths = words.map(w => w.replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g,"").length || 1);
            const totalChars = wordLengths.reduce((a, b) => a + b, 0);
            
            const SYNC_OFFSET_ADJUSTED = 0.02; // Reducido para evitar que el resaltado se adelante a la voz
            
            const wordIntervals = [];
            let cumulativeFraction = 0;
            for (let i = 0; i < words.length; i++) {
                // Reducimos la constante a 1.2 para que la longitud de caracteres tenga más impacto en el ritmo
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

            // Aseguramos que la actualización ocurra en alta frecuencia al reproducir
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

            // Limpiamos listener antiguo de ontimeupdate
            audioPlayer.ontimeupdate = null;

            await audioPlayer.play();
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(trackHighlight);
            setAppMessage({ text: '▶️ Reproduciendo...', isError: false });

        } catch (err) {
            console.error('Error en playAudio:', err);
            setAppMessage({ text: `Error: ${err.message}`, isError: true });
            setIsAudioPlaying(false);
            setActiveAudioText(null);
            setHighlightedWordIndex(-1);
            setIsAudioLoading(false);
        } finally {
            setIsGeneratingAudio(false);
        }
    }, [isAudioPlaying, setAppMessage, setIsAudioLoading, currentCategory, currentDeckName, selectedTone, verbName]);

    const deleteAudio = useCallback(async (textToDelete) => {
        if (!textToDelete || !currentCategory) return;

        const finalVerbName = currentDeckName === 'phonics' ? textToDelete : verbName;
        const tone = selectedTone?.trim().replace(/:$/, '') || '';

        try {
            setAppMessage({ text: '⏳ Eliminando audio...', isError: false });

            // DIP: delega al repositorio
            await audioRepository.delete({
                category: currentCategory,
                deck: currentDeckName,
                text: textToDelete,
                tone,
                verbName: finalVerbName,
            });

            setAppMessage({ text: '✅ Audio eliminado. Regenerando...', isError: false });
            await playAudio(textToDelete);
        } catch (err) {
            console.error('Error deleting audio:', err);
            setAppMessage({ text: `Error al eliminar: ${err.message}`, isError: true });
        }
    }, [currentCategory, currentDeckName, selectedTone, verbName, setAppMessage, playAudio]);

    return { playAudio, deleteAudio, isAudioPlaying, activeAudioText, highlightedWordIndex, isGeneratingAudio };
}