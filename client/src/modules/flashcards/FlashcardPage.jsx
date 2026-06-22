import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Flashcard from '../../features/flashcards/Flashcard';
import Controls from '../../features/flashcards/Controls';
import CategorySelector from '../../features/flashcards/CategorySelector';
import PageLoader from '../../components/common/PageLoader';
import { usePageLoader } from '../../components/common/usePageLoader';
import styles from '../../features/flashcards/Flashcard.module.css';
import { useUIContext } from '../../context/UIContext';
import { useCategoryContext } from './context/CategoryContext';
import { useFlashcardContext } from './context/FlashcardContext';
import { getProgressLabel } from '../../features/flashcards/categoryDisplay';

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
    const {
        isCatalogVisible,
        setIsCatalogVisible,
        isIpaModalOpen, isPhonicsModalOpen,
        setIsIpaModalOpen,
        isFloatingMenuOpen, isSidebarOpen,
        setIsMainLoadingBlocked,
        language = 'en',
    } = useUIContext();
    const { currentCategory, loadingStage: categoryLoadingStage } = useCategoryContext();

    const {
        currentCard, loadingStage: flashcardLoadingStage, filteredData, masterData, currentDeckName,
        nextCard, prevCard, selectedGroup
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
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowLeft') prevCard();
            else if (e.key === 'ArrowRight') nextCard();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [prevCard, nextCard]);

    const touchStartRef = useRef(null);
    const minSwipeDistance = 50;

    const isOverlayOpen = isFloatingMenuOpen || isSidebarOpen || isCatalogVisible || isIpaModalOpen || isPhonicsModalOpen;

    const groupCards = selectedGroup ? masterData.filter(c => c.group_name === selectedGroup) : masterData;
    const displayTotal = groupCards.length;
    const displayLearned = groupCards.filter(c => c.learned).length;
    const displayLabel = getProgressLabel(currentCategory, selectedGroup, language);
    const locale = language === 'es' ? 'es' : 'en';
    const activeLoadingStage =
        categoryLoadingStage
        || flashcardLoadingStage
        || (!currentCard && currentCategory ? 'preparing_content' : null);
    const shouldShowLoading = Boolean(activeLoadingStage);
    const loadingCopy = activeLoadingStage
        ? (FLASHCARD_LOADING_COPY[locale][activeLoadingStage] ?? FLASHCARD_LOADING_COPY[locale].fallback)
        : null;

    useEffect(() => {
        setIsMainLoadingBlocked(shouldShowLoading);
        return () => setIsMainLoadingBlocked(false);
    }, [shouldShowLoading, setIsMainLoadingBlocked]);

    useEffect(() => {
        if (!activeLoadingStage || !loadingCopy) {
            reset();
            return;
        }

        setProgress((prev) => Math.max(prev, loadingCopy.progress));
        setCurrentTask(loadingCopy.status);
    }, [activeLoadingStage, loadingCopy, reset, setCurrentTask, setProgress]);

    return (
        <div className="flashcard-page-wrapper">
            {masterData.length > 0 && !isOverlayOpen && !shouldShowLoading && (
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
                    onTouchStart={(e) => { touchStartRef.current = e.targetTouches[0].clientX; }}
                    onTouchEnd={(e) => {
                        const distance = touchStartRef.current - e.changedTouches[0].clientX;
                        if (distance > minSwipeDistance) nextCard();
                        else if (distance < -minSwipeDistance) prevCard();
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
                    ) : !currentCard ? (
                        !currentCategory ? (
                            <div className="all-done-message">Selecciona una categoría.</div>
                        ) : (
                            <PageLoader
                                title={loadingCopy.title}
                                subtitle={loadingCopy.subtitle}
                                status={loadingCopy.status}
                                currentTask={currentTask}
                                progress={progress}
                            />
                        )
                    ) : (
                        filteredData.length === 0 && masterData.length > 0 ? (
                            <div className="all-done-message">¡Deck '{currentDeckName}' completado! 🎉</div>
                        ) : (
                            <Flashcard key={`${currentCategory}-${currentDeckName}-${currentCard.id}-${language}`} />
                        )
                    )}

                    <Controls />
                </div>
            </div>
        </div>
    );
}
