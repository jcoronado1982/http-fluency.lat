import React, { useState, useEffect, useCallback } from 'react';
import styles from './Flashcard.module.css';
import { useAudioPlayback } from './useAudioPlayback.jsx';
import { useImageGeneration } from './useImageGeneration.js';
import CardFront from './CardFront.jsx';
import CardBack from './CardBack.jsx';
import { useUIContext } from '../../../context/UIContext';
import { useFlashcardUiContext, useFlashcardContext, useCategoryContext } from '../context/flashcardStudyContext';
import { getCardTitle, getAudioLang, getAudioLangForConjugation, isLearningEnglish } from './cardLanguageUtils';
import { registerUiBridgeHandler, unregisterUiBridgeHandler } from '../uiBridge';

const getDefinitionsForForm = (card, form) => {
    if (!card) return [];
    if (form === 'v2') {
        const past = card.irregular?.past;
        if (!past) return [];
        if (Array.isArray(past.definitions) && past.definitions.length > 0) return past.definitions;
        if (past.usage_example) return [{ usage_example: past.usage_example, usage_example_es: past.usage_example_es, pronunciation_guide_es: past.pronunciation_guide_es }];
        return [];
    }
    if (form === 'v3') {
        const part = card.irregular?.participle;
        if (!part) return [];
        if (Array.isArray(part.definitions) && part.definitions.length > 0) return part.definitions;
        if (part.usage_example) return [{ usage_example: part.usage_example, usage_example_es: part.usage_example_es, pronunciation_guide_es: part.pronunciation_guide_es }];
        return [];
    }
    return card.definitions || [];
};

function Flashcard() {
    const {
        setAppMessage,
        isFloatingMenuOpen,
        isSidebarOpen,
        language = 'en',
        studyLanguage = 'en',
    } = useUIContext();
    const {
        setIsAudioLoading,
        setIsIpaModalOpen,
        isCatalogVisible,
        isIpaModalOpen,
        isPhonicsModalOpen,
    } = useFlashcardUiContext();
    const { currentCategory } = useCategoryContext();
    const {
        currentCard: cardData,
        currentDeckName,
        filteredData = [],
        currentIndex = 0,
        updateCardImagePath,
        isLandingDemo = false,
        demoStudyLanguage,
    } = useFlashcardContext();
    const cardLanguage = isLandingDemo && demoStudyLanguage ? demoStudyLanguage : studyLanguage;
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
        isImageLoading, isGeneratingImage, imageUrl, imageRef, currentDefIndex,
        ensureImageForDefinition, ensureImageForForm, deleteImage, uploadImage,
        handleImageError, canCustomizeImages, canDeleteImages,
    } = useImageGeneration({
        cardData, currentCategory, currentDeckName, setAppMessage, updateCardImagePath, activeForm
    });

    const buildAllBlurred = useCallback((form = activeForm) => {
        if (!cardData) return {};
        const defs = getDefinitionsForForm(cardData, form);
        return defs.reduce((acc, _, i) => ({ ...acc, [i]: true }), {});
    }, [cardData, activeForm, isLandingDemo]);

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

    const prefetchCardAudio = useCallback((card) => {
        if (!card || isAnyOverlayOpen || isLandingDemo) return;

        const defs = getDefinitionsForForm(card, 'v1');
        const title = getCardTitle({
            name: card.name,
            definitions: card.definitions || [],
        }, cardLanguage);
        const audioLang = getAudioLang(cardLanguage);
        const cardVerbName = card.name;

        if (title) void prefetchAudio(title, audioLang, cardVerbName);
        defs.forEach((def) => {
            const exampleText = cardLanguage === 'en' ? def.usage_example : def.usage_example_es;
            if (exampleText) void prefetchAudio(exampleText, audioLang, cardVerbName);
        });
    }, [cardLanguage, isAnyOverlayOpen, isLandingDemo, prefetchAudio]);

    useEffect(() => {
        if (!cardData) return;
        prefetchCardAudio(cardData);
    }, [cardData, prefetchCardAudio]);

    useEffect(() => {
        if (!filteredData.length || isAnyOverlayOpen) return;

        const nextIndex = (currentIndex + 1) % filteredData.length;
        const prevIndex = (currentIndex - 1 + filteredData.length) % filteredData.length;

        if (nextIndex !== currentIndex) prefetchCardAudio(filteredData[nextIndex]);
        if (prevIndex !== currentIndex && prevIndex !== nextIndex) {
            prefetchCardAudio(filteredData[prevIndex]);
        }
    }, [filteredData, currentIndex, isAnyOverlayOpen, prefetchCardAudio]);

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
            }, cardLanguage);
            if (title && !isAnyOverlayOpen) {
                void playAudio(title, getAudioLang(cardLanguage));
            }
        }
    }, [cardData, setAppMessage, prevCardId, stopAudio, playAudio, cardLanguage, isAnyOverlayOpen, buildAllBlurred]);

    useEffect(() => {
        if (!cardData?.irregular) return;

        setBlurredState(buildAllBlurred(activeForm));
    }, [activeForm, cardData, buildAllBlurred]);

    useEffect(() => {
        const blurAllPhrases = () => {
            setBlurredState(buildAllBlurred(activeForm));
        };
        const revealPhrase = () => {
            if (!cardData) return;
            revealDefinition(0);
            void ensureImageForDefinition(0);
        };
        const revealAndPlayPhrase = () => {
            if (!cardData) return;
            const defs = getDefinitionsForForm(cardData, activeForm);
            const def = defs[0];
            if (!def) return;

            revealDefinition(0);
            void ensureImageForDefinition(0);
            const exampleText = isLearningEnglish(cardLanguage)
                ? def.usage_example
                : def.usage_example_es;
            if (exampleText?.trim()) {
                void playAudio(exampleText.trim(), getAudioLang(cardLanguage));
            }
        };
        const playPhrase = () => {
            if (!cardData) return;
            const defs = getDefinitionsForForm(cardData, activeForm);
            const def = defs[0];
            if (!def) return;

            revealDefinition(0);
            void ensureImageForDefinition(0);
            const exampleText = isLearningEnglish(cardLanguage)
                ? def.usage_example
                : def.usage_example_es;
            if (exampleText?.trim()) {
                void playAudio(exampleText.trim(), getAudioLang(cardLanguage));
            }
        };

        registerUiBridgeHandler('blurPhrases', blurAllPhrases);
        registerUiBridgeHandler('revealPhrase', revealPhrase);
        registerUiBridgeHandler('revealAndPlayPhrase', revealAndPlayPhrase);
        registerUiBridgeHandler('playPhrase', playPhrase);
        return () => {
            unregisterUiBridgeHandler('blurPhrases');
            unregisterUiBridgeHandler('revealPhrase');
            unregisterUiBridgeHandler('revealAndPlayPhrase');
            unregisterUiBridgeHandler('playPhrase');
        };
    }, [activeForm, buildAllBlurred, cardData, cardLanguage, ensureImageForDefinition, playAudio, revealDefinition]);

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
        <div className={styles.flashcardContainer} data-tour="flashcard-contenedor">
            <div
                className={`${styles.card} ${isFlipped ? styles.flipped : ''}`}
                onClick={() => setIsFlipped(p => !p)}
                data-tour="boton-voltear-tarjeta"
                data-flipped={isFlipped ? 'true' : 'false'}
                role="button"
                aria-pressed={isFlipped}
                aria-label={language === 'es' ? 'Voltear tarjeta' : 'Flip card'}
            >


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
                    imageKey={`${activeForm}-${currentDefIndex}`}
                    playDefinitionMedia={playDefinitionMedia}
                    deleteImage={deleteImage}
                    uploadImage={uploadImage}
                    handleImageError={handleImageError}
                    canCustomizeImages={canCustomizeImages}
                    canDeleteImages={canDeleteImages}
                    deleteAudio={deleteAudio}
                    isGeneratingAudio={isGeneratingAudio}
                    currentLanguage={cardLanguage}
                />
                <CardBack
                    cardData={cardData}
                    activeForm={activeForm}
                    currentLanguage={cardLanguage}
                />
            </div>
        </div>
    );
}

export default Flashcard;
