import React, { useState, useEffect, useCallback } from 'react';
import styles from './Flashcard.module.css';
import { useAudioPlayback } from './useAudioPlayback.jsx';
import { useImageGeneration } from './useImageGeneration.js';
import CardFront from './CardFront.jsx';
import CardBack from './CardBack.jsx';
import { useAppContext } from '../../context/AppContext';
import { useFlashcardContext } from '../../context/FlashcardContext';

function Flashcard() {
    const { setAppMessage, setIsAudioLoading, currentCategory, setIsIpaModalOpen, language = 'en' } = useAppContext();
    const { currentCard: cardData, currentDeckName, updateCardImagePath } = useFlashcardContext();
    const [prevCardId, setPrevCardId] = useState(null);

    const [isFlipped, setIsFlipped] = useState(false);
    const [activeForm, setActiveForm] = useState('v1');
    const [blurredState, setBlurredState] = useState({});

    const {
        playAudio, deleteAudio, activeAudioText, highlightedWordIndex, isGeneratingAudio
    } = useAudioPlayback({
        setAppMessage, setIsAudioLoading, currentCategory, currentDeckName,
        verbName: cardData?.name
    });

    const {
        isImageLoading, isGeneratingImage, imageUrl, imageRef,
        ensureImageForDefinition, deleteImage, uploadImage,
        handleImageError, canCustomizeImages,
    } = useImageGeneration({
        cardData, currentCategory, currentDeckName, setAppMessage, updateCardImagePath, activeForm
    });

    const playDefinitionMedia = useCallback(async (defIndex, text, lang = 'en') => {
        await Promise.all([
            ensureImageForDefinition(defIndex),
            playAudio(text, lang),
        ]);
    }, [ensureImageForDefinition, playAudio]);

    useEffect(() => {
        if (!cardData) return;
        
        // Solo reseteamos si realmente cambiamos de tarjeta (ID o nombre)
        const currentId = cardData.id || cardData.name || cardData.word;
        if (currentId !== prevCardId) {
            setIsFlipped(false);
            setActiveForm('v1');
            setBlurredState(cardData.definitions?.reduce((acc, _, i) => ({ ...acc, [i]: true }), {}) || {});
            setAppMessage({ text: '', isError: false });
            setPrevCardId(currentId);
        }
    }, [cardData, setAppMessage, prevCardId]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                setIsFlipped(p => !p);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    if (!cardData) return <div className={styles.flashcardContainer}>Cargando datos...</div>;

    return (
        <div className={styles.flashcardContainer}>
            <div className={`${styles.card} ${isFlipped ? styles.flipped : ''}`} onClick={() => setIsFlipped(p => !p)}>


                <CardFront
                    cardData={cardData}
                    activeForm={activeForm}
                    setActiveForm={setActiveForm}
                    onOpenIpaModal={() => setIsIpaModalOpen(true)}
                    playAudio={playAudio}
                    activeAudioText={activeAudioText}
                    highlightedWordIndex={highlightedWordIndex}
                    blurredState={blurredState}
                    toggleBlur={(i) => setBlurredState(p => ({ ...p, [i]: !p[i] }))}
                    isImageLoading={isImageLoading}
                    isGeneratingImage={isGeneratingImage}
                    imageUrl={imageUrl}
                    imageRef={imageRef}
                    playDefinitionMedia={playDefinitionMedia}
                    deleteImage={deleteImage}
                    uploadImage={uploadImage}
                    handleImageError={handleImageError}
                    canCustomizeImages={canCustomizeImages}
                    deleteAudio={deleteAudio}
                    isGeneratingAudio={isGeneratingAudio}
                    currentLanguage={language}
                />
                <CardBack 
                    cardData={cardData} 
                    activeForm={activeForm}
                    currentLanguage={language}
                />
            </div>
        </div>
    );
}

export default Flashcard;
