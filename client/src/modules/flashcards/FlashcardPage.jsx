import React, { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Flashcard, Controls, StudyMediaProvider } from '../../components/flashcardStudy';
import { STUDY_MEDIA_VARIANT_APP } from '../../contracts/studyMediaVariants';
import CategorySelector from './features/CategorySelector';
import PageLoader from '../../components/common/PageLoader';
import { usePageLoader } from '../../components/common/usePageLoader';
import styles from './features/Flashcard.module.css';
import CompletionCard from './features/CompletionCard';
import { useUIContext } from '../../context/UIContext';
import { useFlashcardUiContext } from './context/FlashcardUiContext';
import { useCategoryContext } from './context/CategoryContext';
import { useFlashcardContext } from './context/FlashcardContext';
import { getCategoryDisplayName, getGroupDisplayName, getProgressLabel } from './features/categoryDisplay';
import { getNextStudyStep } from './config/catalogOrder';
import { navigationIntentRef } from './navigationIntent';
import { flashcardPort, audioPort, imagePort, imageCompressionService } from './composition';
import {
    registerUiBridgeHandler,
    unregisterUiBridgeHandler,
} from './uiBridge';

const FLASHCARD_LOADING_COPY = {
    es: {
        loading_categories: {
            title: 'Cargando categorías',
            subtitle: 'Estamos preparando el contenido.',
            status: 'Obteniendo categorías disponibles...',
            progress: 18,
        },
        loading_decks: {
            title: 'Cargando decks',
            subtitle: 'Estamos preparando el contenido.',
            status: 'Buscando niveles y colecciones...',
            progress: 44,
        },
        loading_cards: {
            title: 'Cargando tarjetas',
            subtitle: 'Estamos preparando el contenido.',
            status: 'Obteniendo tarjetas y progreso...',
            progress: 76,
        },
        preparing_content: {
            title: 'Preparando contenido',
            subtitle: 'Estamos dejando todo listo para continuar.',
            status: 'Organizando la información cargada...',
            progress: 92,
        },
        fallback: {
            title: 'Cargando contenido',
            subtitle: 'Estamos preparando el contenido.',
            status: 'Procesando información...',
            progress: 56,
        },
    },
    en: {
        loading_categories: {
            title: 'Loading categories',
            subtitle: 'We are preparing the content.',
            status: 'Fetching available categories...',
            progress: 18,
        },
        loading_decks: {
            title: 'Loading decks',
            subtitle: 'We are preparing the content.',
            status: 'Finding levels and collections...',
            progress: 44,
        },
        loading_cards: {
            title: 'Loading cards',
            subtitle: 'We are preparing the content.',
            status: 'Fetching cards and progress...',
            progress: 76,
        },
        preparing_content: {
            title: 'Preparing content',
            subtitle: 'We are getting everything ready to continue.',
            status: 'Organizing the loaded information...',
            progress: 92,
        },
        fallback: {
            title: 'Loading content',
            subtitle: 'We are preparing the content.',
            status: 'Processing information...',
            progress: 56,
        },
    },
};

export default function FlashcardPage() {
    const location = useLocation();
    const isOnboardingTour = new URLSearchParams(location.search).get('onboarding_tour') === 'flashcards';
    const {
        isCatalogVisible,
        setIsCatalogVisible,
        isIpaModalOpen, isPhonicsModalOpen,
        setIsIpaModalOpen,
    } = useFlashcardUiContext();
    const {
        isFloatingMenuOpen, isSidebarOpen,
        language = 'en',
        setIsHeaderSuppressed,
    } = useUIContext();
    const { currentCategory, changeCategory, loadingStage: categoryLoadingStage } = useCategoryContext();

    const {
        currentCard, loadingStage: flashcardLoadingStage, filteredData, masterData, currentDeckName,
        nextCard, prevCard, selectedGroup, changeDeck, setSelectedGroup, justCompletedInSession,
    } = useFlashcardContext();
    const isPronounsCategory = currentCategory === 'pronouns';
    const { progress, currentTask, reset, setProgress, setCurrentTask } = usePageLoader();

    useEffect(() => {
        const state = location.state;
        if (!state) return;
        if (state.openCatalog) setIsCatalogVisible(true);
        if (state.openIpa) setIsIpaModalOpen(true);
        if (state.openCatalog || state.openIpa) {
            window.history.replaceState({}, '', location.pathname);
        }
    }, [location.state, location.pathname, setIsCatalogVisible, setIsIpaModalOpen]);

    useEffect(() => {
        registerUiBridgeHandler('openCatalog', () => setIsCatalogVisible(true));
        registerUiBridgeHandler('openIpa', () => setIsIpaModalOpen(true));
        return () => {
            unregisterUiBridgeHandler('openCatalog');
            unregisterUiBridgeHandler('openIpa');
        };
    }, [setIsCatalogVisible, setIsIpaModalOpen]);

    useEffect(() => {
        flashcardPort.touchStudyDay().catch(() => {});
    }, []);

    const touchStartRef = useRef(null);
    const minSwipeDistance = 50;

    const isOverlayOpen = isFloatingMenuOpen || isSidebarOpen || isCatalogVisible || isIpaModalOpen || isPhonicsModalOpen;

    const groupCards = selectedGroup ? masterData.filter(c => c.group_name === selectedGroup) : masterData;
    const displayTotal = groupCards.length;
    const displayLearned = groupCards.filter(c => c.learned).length;
    const displayLabel = getProgressLabel(currentCategory, selectedGroup, language);
    const locale = language === 'es' ? 'es' : 'en';
    const isCompletionVisible = masterData.length > 0 && filteredData.length === 0;
    const isUserViewingCompleted = isCompletionVisible
        && !justCompletedInSession
        && navigationIntentRef.current === 'user';
    const shouldShowCompletionCelebration = isCompletionVisible && justCompletedInSession;
    const shouldShowCompletionCard = shouldShowCompletionCelebration || isUserViewingCompleted;
    const activeLoadingStage = categoryLoadingStage || flashcardLoadingStage;
    const shouldShowLoading = Boolean(activeLoadingStage);
    const loadingCopy = activeLoadingStage
        ? (FLASHCARD_LOADING_COPY[locale][activeLoadingStage] ?? FLASHCARD_LOADING_COPY[locale].fallback)
        : null;
    const recommendation = isCompletionVisible
        ? getNextStudyStep(currentCategory, currentDeckName, selectedGroup)
        : null;
    const completionScope = selectedGroup ? 'group' : 'deck';
    const getDeckDisplayName = (deckName) => {
        if (!deckName) return '';
        const lower = deckName.toLowerCase();
        const levels = FLASHCARD_LOADING_COPY[locale] && locale === 'es'
            ? { basic: 'Basico', intermediate: 'Intermedio', advanced: 'Avanzado' }
            : { basic: 'Basic', intermediate: 'Intermediate', advanced: 'Advanced' };

        if (lower.includes('advanced')) return levels.advanced;
        if (lower.includes('intermediate')) return levels.intermediate;
        if (lower.includes('basic')) return levels.basic;
        return deckName;
    };
    const completedLabel = selectedGroup
        ? getGroupDisplayName(selectedGroup, language)
        : `${getCategoryDisplayName(currentCategory, language)} • ${getDeckDisplayName(currentDeckName)}`;

    useEffect(() => {
        if (!activeLoadingStage || !loadingCopy) {
            reset();
            return;
        }

        setProgress((prev) => Math.max(prev, loadingCopy.progress));
        setCurrentTask(loadingCopy.status);
    }, [activeLoadingStage, loadingCopy, reset, setCurrentTask, setProgress]);

    useEffect(() => {
        setIsHeaderSuppressed(shouldShowLoading && !isOnboardingTour);
        return () => setIsHeaderSuppressed(false);
    }, [shouldShowLoading, isOnboardingTour, setIsHeaderSuppressed]);

    const handleContinueRecommendation = useCallback(() => {
        if (!recommendation) {
            setIsCatalogVisible(true);
            return;
        }

        if (recommendation.type === 'group') {
            setSelectedGroup(recommendation.group);
            return;
        }

        if (recommendation.type === 'deck') {
            setSelectedGroup(null);
            changeDeck(recommendation.deck);
            return;
        }

        setSelectedGroup(null);
        changeCategory(recommendation.category);
    }, [recommendation, setIsCatalogVisible, setSelectedGroup, changeDeck, changeCategory]);

    const autoAdvancedRef = useRef(false);

    useEffect(() => {
        autoAdvancedRef.current = false;
    }, [currentCategory, currentDeckName, selectedGroup]);

    // Solo auto-avanzar tras completar el mazo en esta sesión (evita bucle al abrir decks ya aprendidos).
    useEffect(() => {
        if (!justCompletedInSession) return;
        if (navigationIntentRef.current === 'user') return;
        if (shouldShowLoading || !isCompletionVisible || autoAdvancedRef.current) {
            return;
        }

        autoAdvancedRef.current = true;
        handleContinueRecommendation();
    }, [
        justCompletedInSession,
        shouldShowLoading,
        isCompletionVisible,
        handleContinueRecommendation,
    ]);

    return (
        <StudyMediaProvider
            mediaVariant={STUDY_MEDIA_VARIANT_APP}
            audioPort={audioPort}
            imagePort={imagePort}
            imageCompressionService={imageCompressionService}
        >
        <div className="flashcard-page-wrapper">
            {masterData.length > 0 && !isOverlayOpen && !shouldShowLoading && !shouldShowCompletionCard && (
                <div className={`${styles.cardCounter} ${isPronounsCategory ? styles.pronounsCounter : ''}`}>
                    <div className={styles.counterItem}>
                        <span className={styles.counterLabel}>{displayLabel}</span>
                        <div className={styles.counterValues}>
                            <span className={styles.learnedValue}>{displayLearned}</span>
                            <span className={styles.totalValue}>/ {displayTotal}</span>
                        </div>
                    </div>
                </div>
            )}

            {isCatalogVisible && <CategorySelector />}

            <div className="app-container">
                <div className="flashcard-main-area"
                    onTouchStart={(e) => {
                        if (shouldShowLoading || shouldShowCompletionCard) return;
                        touchStartRef.current = e.targetTouches[0].clientX;
                    }}
                    onTouchEnd={(e) => {
                        if (shouldShowLoading || isCompletionVisible || touchStartRef.current == null) return;
                        const distance = touchStartRef.current - e.changedTouches[0].clientX;
                        if (distance > minSwipeDistance) nextCard();
                        else if (distance < -minSwipeDistance) prevCard();
                        touchStartRef.current = null;
                    }}
                >
                    {shouldShowLoading ? (
                        <PageLoader
                            title={loadingCopy.title}
                            subtitle={loadingCopy.subtitle}
                            status={loadingCopy.status}
                            currentTask={currentTask}
                            progress={progress}
                        />
                    ) : shouldShowCompletionCard ? (
                        <CompletionCard
                            language={language}
                            completionScope={completionScope}
                            completedLabel={completedLabel}
                            completedCount={displayLearned}
                            totalCount={displayTotal}
                            recommendation={recommendation}
                            onContinue={handleContinueRecommendation}
                            onOpenCatalog={() => setIsCatalogVisible(true)}
                        />
                    ) : !currentCard ? (
                        !currentCategory ? (
                            <div className="all-done-message">Selecciona una categoría.</div>
                        ) : (
                            <div className="all-done-message">No hay tarjetas disponibles en este momento.</div>
                        )
                    ) : (
                        <Flashcard key={`${currentCategory}-${currentDeckName}-${currentCard.id}-${language}`} />
                    )}
                    {!shouldShowLoading && !shouldShowCompletionCard && <Controls />}
                </div>
            </div>
        </div>
        </StudyMediaProvider>
    );
}
