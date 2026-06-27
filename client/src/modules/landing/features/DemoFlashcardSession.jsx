/**
 * DemoFlashcardSession — sesión real de flashcards en el landing (sin login).
 * UI compartida del shell (misma que la app); audio/imagen en namespace landing-demo.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
    Flashcard,
    Controls,
    FlashcardContext,
    FlashcardUiContext,
    CategoryContext,
    StudyMediaProvider,
} from '../../../components/flashcardStudy';
import { demoAudioPort, demoImagePort } from '../composition';
import { STUDY_MEDIA_VARIANT_LANDING_DEMO } from '../../../contracts/studyMediaVariants';
import rawCards from '../data/demoCards.json';
import {
    LANDING_DEMO_CATEGORY,
    LANDING_DEMO_DECK,
    LANDING_DEMO_CARD_LIMIT,
    buildLandingDemoImagePath,
} from '../../../contracts/landingDemoNamespace';
import {
    INITIAL_DEMO_CARDS,
    patchDefinitionImage,
    prepareDemoCards,
} from './demo/demoSessionUtils';

const noop = () => {};

export default function DemoFlashcardSession({
    language = 'en',
    badgeLabel = '',
    promptExtraRef,
    imagePromptApplySignal = 0,
}) {
    const [cards, setCards] = useState(() => INITIAL_DEMO_CARDS.map((c) => ({ ...c })));
    const [currentIndex, setCurrentIndex] = useState(0);

    const masterData = cards;
    const filteredData = useMemo(() => masterData.filter((c) => !c.learned), [masterData]);
    const currentCard = filteredData[currentIndex] ?? null;

    const nextCard = useCallback(() => {
        if (filteredData.length <= 1) return;
        setCurrentIndex((i) => (i + 1) % filteredData.length);
    }, [filteredData.length]);

    const prevCard = useCallback(() => {
        if (filteredData.length <= 1) return;
        setCurrentIndex((i) => (i - 1 + filteredData.length) % filteredData.length);
    }, [filteredData.length]);

    const markAsLearned = useCallback(() => {
        if (!currentCard) return;
        setCards((prev) => prev.map((c) => (
            c.id === currentCard.id
                ? { ...c, learned: true, learned_at: new Date().toISOString() }
                : c
        )));
        setCurrentIndex((i) => {
            const remaining = filteredData.length - 1;
            if (remaining <= 0) return 0;
            return i % remaining;
        });
    }, [currentCard, filteredData.length]);

    const resetDeck = useCallback(() => {
        setCards(prepareDemoCards(rawCards.slice(0, LANDING_DEMO_CARD_LIMIT)).map((c) => ({ ...c })));
        setCurrentIndex(0);
    }, []);

    const updateCardImagePath = useCallback((cardId, imagePath, defIndex = 0, form = 'v1') => {
        setCards((prev) => patchDefinitionImage(prev, cardId, imagePath, defIndex, form));
    }, []);

    const flashcardValue = useMemo(() => ({
        currentCard,
        currentIndex,
        filteredData,
        masterData,
        nextCard,
        prevCard,
        markAsLearned,
        resetDeck,
        currentDeckName: LANDING_DEMO_DECK,
        selectedGroup: null,
        justCompletedInSession: false,
        loadingStage: null,
        changeDeck: noop,
        setSelectedGroup: noop,
        updateCardImagePath,
        isLandingDemo: true,
        demoStudyLanguage: language === 'es' ? 'en' : 'es',
        buildDemoImagePath: buildLandingDemoImagePath,
        demoImagePromptExtraRef: promptExtraRef,
        imagePromptApplySignal: imagePromptApplySignal,
    }), [
        currentCard, currentIndex, filteredData, masterData,
        nextCard, prevCard, markAsLearned, resetDeck, updateCardImagePath,
        promptExtraRef, imagePromptApplySignal, language,
    ]);

    const [isAudioLoading, setIsAudioLoading] = useState(false);
    const [isIpaModalOpen, setIsIpaModalOpen] = useState(false);
    const [isPhonicsModalOpen, setIsPhonicsModalOpen] = useState(false);

    const uiValue = useMemo(() => ({
        isCatalogVisible: false,
        setIsCatalogVisible: noop,
        isIpaModalOpen,
        setIsIpaModalOpen,
        isPhonicsModalOpen,
        setIsPhonicsModalOpen,
        isAudioLoading,
        setIsAudioLoading,
        openCatalog: noop,
        openIpa: () => setIsIpaModalOpen(true),
        openPhonics: () => setIsPhonicsModalOpen(true),
    }), [isAudioLoading, isIpaModalOpen, isPhonicsModalOpen]);

    const categoryValue = useMemo(() => ({
        categories: [LANDING_DEMO_CATEGORY],
        categoryTotals: { [LANDING_DEMO_CATEGORY]: LANDING_DEMO_CARD_LIMIT },
        currentCategory: LANDING_DEMO_CATEGORY,
        changeCategory: noop,
        isLoading: false,
        loadingStage: null,
    }), []);

    return (
        <StudyMediaProvider
            mediaVariant={STUDY_MEDIA_VARIANT_LANDING_DEMO}
            audioPort={demoAudioPort}
            imagePort={demoImagePort}
        >
            <CategoryContext.Provider value={categoryValue}>
                <FlashcardUiContext.Provider value={uiValue}>
                    <FlashcardContext.Provider value={flashcardValue}>
                        <div className="flashcard-page-wrapper" data-landing-demo>
                            <div className="app-container">
                                <div className="flashcard-main-area">
                                    <div className="lp-demo-card-frame">
                                        {badgeLabel ? (
                                            <span className="lp-demo-badge">
                                                <span className="lp-demo-badge-dot" aria-hidden />
                                                <span className="lp-demo-badge-text">{badgeLabel}</span>
                                            </span>
                                        ) : null}
                                        {filteredData.length === 0 ? (
                                            <div className="all-done-message" style={{ textAlign: 'center', padding: '2rem' }}>
                                                {language === 'es'
                                                    ? '🎉 ¡Terminaste el demo! Crea tu cuenta para continuar.'
                                                    : '🎉 You finished the demo! Create your account to continue.'}
                                                <br />
                                                <button
                                                    type="button"
                                                    onClick={resetDeck}
                                                    style={{
                                                        marginTop: '1rem',
                                                        padding: '0.5rem 1.5rem',
                                                        background: 'rgba(244,114,182,0.15)',
                                                        border: '1px solid rgba(244,114,182,0.4)',
                                                        borderRadius: '12px',
                                                        color: '#f472b6',
                                                        cursor: 'pointer',
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    {language === 'es' ? 'Reiniciar demo' : 'Restart demo'}
                                                </button>
                                            </div>
                                        ) : (
                                            <Flashcard key={`demo-flashcard-${language}`} />
                                        )}
                                    </div>
                                    {filteredData.length > 0 && <Controls />}
                                </div>
                            </div>
                        </div>
                    </FlashcardContext.Provider>
                </FlashcardUiContext.Provider>
            </CategoryContext.Provider>
        </StudyMediaProvider>
    );
}

export { buildLandingDemoImagePath, LANDING_DEMO_CATEGORY, LANDING_DEMO_DECK };
