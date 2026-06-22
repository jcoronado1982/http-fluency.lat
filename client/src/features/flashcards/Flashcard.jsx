import React, { useState, useEffect, useCallback } from 'react';
import styles from './Flashcard.module.css';
import { useAudioPlayback } from './useAudioPlayback.jsx';
import { useImageGeneration } from './useImageGeneration.js';
import CardFront from './CardFront.jsx';
import CardBack from './CardBack.jsx';
import { useUIContext } from '../../context/UIContext';
import { useFlashcardContext } from '../../modules/flashcards/context/FlashcardContext';
import { useCategoryContext } from '../../modules/flashcards/context/CategoryContext';
import { getCardTitle } from './cardLanguageUtils';

const getDefinitionsForForm = (card, form) => {
    if (!card) return [];
    if (form === 'v2') {
        return card.irregular?.past?.definitions || [];
    }
    if (form === 'v3') {
        return card.irregular?.participle?.definitions || [];
    }
    return card.definitions || [];
};

function Flashcard() {
    const {
        setAppMessage,
        setIsAudioLoading,
        setIsIpaModalOpen,
        isCatalogVisible,
        isIpaModalOpen,
        isPhonicsModalOpen,
        isFloatingMenuOpen,
        isSidebarOpen,
        language = 'en',
    } = useUIContext();
    const { currentCategory } = useCategoryContext();
    const { currentCard: cardData, currentDeckName, updateCardImagePath } = useFlashcardContext();
    const [prevCardId, setPrevCardId] = useState(null);
    const isAnyOverlayOpen =
        isCatalogVisible ||
        isIpaModalOpen ||
        isPhonicsModalOpen ||
        isFloatingMenuOpen ||
        isSidebarOpen;

    const [isFlipped, setIsFlipped] = useState(false);
    const [activeForm, setActiveForm] = useState('v1');
    const [blurredState, setBlurredState] = useState({});

    const {
        playAudio, stopAudio, deleteAudio, activeAudioText, highlightedWordIndex, isGeneratingAudio
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

    const handleToggleBlur = useCallback((defIndex) => {
        // Si la frase estaba desenfocada, también cargamos su imagen
        if (blurredState[defIndex]) {
            ensureImageForDefinition(defIndex);
        }
        setBlurredState(prev => ({ ...prev, [defIndex]: !prev[defIndex] }));
    }, [blurredState, ensureImageForDefinition]);

    useEffect(() => {
        if (!cardData) return;
        
        // Solo reseteamos si realmente cambiamos de tarjeta (ID o nombre)
        const currentId = cardData.id || cardData.name || cardData.word;
        if (currentId !== prevCardId) {
            stopAudio();
            setIsFlipped(false);
            setActiveForm('v1');
            setBlurredState(
                getDefinitionsForForm(cardData, 'v1').reduce((acc, _, i) => ({ ...acc, [i]: true }), {})
            );
            setAppMessage({ text: '', isError: false });
            setPrevCardId(currentId);

            const title = getCardTitle({
                name: cardData.name,
                definitions: cardData.definitions || [],
            }, language);
            if (title && !isAnyOverlayOpen) {
                void playAudio(title, language);
            }
        }
    }, [cardData, setAppMessage, prevCardId, stopAudio, playAudio, language, isAnyOverlayOpen]);

    useEffect(() => {
        if (!cardData?.irregular) return;

        setBlurredState(
            getDefinitionsForForm(cardData, activeForm).reduce((acc, _, i) => ({ ...acc, [i]: true }), {})
        );
    }, [activeForm, cardData]);

    useEffect(() => () => {
        stopAudio();
    }, [stopAudio]);

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
                    toggleBlur={handleToggleBlur}
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
