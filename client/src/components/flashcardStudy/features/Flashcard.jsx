import React, { useState, useEffect, useCallback } from 'react';
import styles from './Flashcard.module.css';
import { useAudioPlayback } from './useAudioPlayback.jsx';
import { useImageGeneration } from './useImageGeneration.js';
import CardFront from './CardFront.jsx';
import CardBack from './CardBack.jsx';
import { useUIContext } from '../../../context/UIContext';
import { useFlashcardUiContext, useFlashcardContext, useCategoryContext } from '../context/flashcardStudyContext';
import { getCardTitle, getAudioLang, getAudioLangForConjugation } from './cardLanguageUtils';

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
        isFloatingMenuOpen,
        isSidebarOpen,
        language = 'en',
    } = useUIContext();
    const {
        setIsAudioLoading,
        setIsIpaModalOpen,
        isCatalogVisible,
        isIpaModalOpen,
        isPhonicsModalOpen,
    } = useFlashcardUiContext();
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
        playAudio, prefetchAudio, stopAudio, deleteAudio, activeAudioText, highlightedWordIndex, isGeneratingAudio
    } = useAudioPlayback({
        setAppMessage, setIsAudioLoading, currentCategory, currentDeckName,
        verbName: cardData?.name
    });

    const {
        isImageLoading, isGeneratingImage, imageUrl, imageRef,
        ensureImageForDefinition, ensureImageForForm, deleteImage, uploadImage,
        handleImageError, canCustomizeImages, canDeleteImages,
    } = useImageGeneration({
        cardData, currentCategory, currentDeckName, setAppMessage, updateCardImagePath, activeForm
    });

    const buildAllBlurred = useCallback((form = activeForm) => {
        if (!cardData) return {};
        return getDefinitionsForForm(cardData, form).reduce((acc, _, i) => ({ ...acc, [i]: true }), {});
    }, [cardData, activeForm]);

    const revealDefinition = useCallback((defIndex, form = activeForm) => {
        if (!cardData) return;
        const defs = getDefinitionsForForm(cardData, form);
        setBlurredState(defs.reduce((acc, _, i) => ({ ...acc, [i]: i !== defIndex }), {}));
    }, [cardData, activeForm]);

    const playDefinitionMedia = useCallback((defIndex, text, lang = 'en') => {
        revealDefinition(defIndex);
        void ensureImageForDefinition(defIndex);
        void playAudio(text, lang);
    }, [revealDefinition, ensureImageForDefinition, playAudio]);

    /** Audio e imagen en paralelo al cambiar v1/v2/v3 (sin esperar uno al otro). */
    const handleConjugationSelect = useCallback((formKey, formLabel) => {
        setActiveForm(formKey);
        ensureImageForForm(formKey, 0);
        void playAudio(formLabel, getAudioLangForConjugation());
    }, [ensureImageForForm, playAudio]);

    const handleToggleBlur = useCallback((defIndex) => {
        setBlurredState(prev => {
            const isCurrentlyBlurred = prev[defIndex] !== false;
            if (isCurrentlyBlurred) {
                ensureImageForDefinition(defIndex);
                if (!cardData) return prev;
                const defs = getDefinitionsForForm(cardData, activeForm);
                return defs.reduce((acc, _, i) => ({ ...acc, [i]: i !== defIndex }), {});
            }
            return { ...prev, [defIndex]: true };
        });
    }, [ensureImageForDefinition, cardData, activeForm]);

    useEffect(() => {
        if (!cardData || isAnyOverlayOpen) return;

        const defs = getDefinitionsForForm(cardData, 'v1');
        const title = getCardTitle({
            name: cardData.name,
            definitions: cardData.definitions || [],
        }, language);
        const audioLang = getAudioLang(language);

        if (title) void prefetchAudio(title, audioLang);
        defs.forEach((def) => {
            const exampleText = language === 'es' ? def.usage_example : def.usage_example_es;
            if (exampleText) void prefetchAudio(exampleText, audioLang);
        });
    }, [cardData, language, isAnyOverlayOpen, prefetchAudio]);

    useEffect(() => {
        if (!cardData) return;
        
        // Solo reseteamos si realmente cambiamos de tarjeta (ID o nombre)
        const currentId = cardData.id || cardData.name || cardData.word;
        if (currentId !== prevCardId) {
            stopAudio();
            setIsFlipped(false);
            setActiveForm('v1');
            setBlurredState(buildAllBlurred('v1'));
            setAppMessage({ text: '', isError: false });
            setPrevCardId(currentId);

            const title = getCardTitle({
                name: cardData.name,
                definitions: cardData.definitions || [],
            }, language);
            if (title && !isAnyOverlayOpen) {
                void playAudio(title, getAudioLang(language));
            }
        }
    }, [cardData, setAppMessage, prevCardId, stopAudio, playAudio, language, isAnyOverlayOpen]);

    useEffect(() => {
        if (!cardData?.irregular) return;

        setBlurredState(buildAllBlurred(activeForm));
    }, [activeForm, cardData, buildAllBlurred]);

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
                    onConjugationSelect={handleConjugationSelect}
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
                    canDeleteImages={canDeleteImages}
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
