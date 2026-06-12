import React, { useEffect, useRef } from 'react';
import Flashcard from '../features/flashcards/Flashcard';
import Controls from '../features/flashcards/Controls';
import IpaModal from '../features/flashcards/IpaModal';
import PhonicsModal from '../features/flashcards/PhonicsModal';
import CategorySelector from '../features/flashcards/CategorySelector';
import styles from '../features/flashcards/Flashcard.module.css';


import { useAppContext } from '../context/AppContext';
import { useFlashcardContext } from '../context/FlashcardContext';

const formatCategory = (name) => name ? name.replace(/[_-]/g, ' ').toUpperCase() : '';

export default function FlashcardPage() {

    const {
        currentCategory, isLoading, isCatalogVisible,
        isIpaModalOpen, isPhonicsModalOpen,
        isFloatingMenuOpen, isSidebarOpen
    } = useAppContext();

    const {
        currentCard, isDeckLoading, filteredData, masterData, currentDeckName,
        nextCard, prevCard, selectedGroup
    } = useFlashcardContext();

    // Keyboard Nav
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowLeft') prevCard();
            else if (e.key === 'ArrowRight') nextCard();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [prevCard, nextCard]);

    // FIX: usar useRef para que el valor persista entre renders (antes era let → se reiniciaba)
    const touchStartRef = useRef(null);
    const minSwipeDistance = 50;

    const isOverlayOpen = isFloatingMenuOpen || isSidebarOpen || isCatalogVisible || isIpaModalOpen || isPhonicsModalOpen;

    const groupCards = selectedGroup ? masterData.filter(c => c.group_name === selectedGroup) : masterData;
    const displayTotal = groupCards.length;
    const displayLearned = groupCards.filter(c => c.learned).length;
    const displayLabel = selectedGroup 
        ? `${formatCategory(currentCategory)} • ${selectedGroup.toUpperCase()}`
        : formatCategory(currentCategory);

    if (isLoading) return <div className="loading-container"><img src="/loading.gif" alt="Cargando..." /></div>;

    return (
        <div className="flashcard-page-wrapper">
            {/* Progress Counter (Global Position) */}
            {masterData.length > 0 && !isOverlayOpen && (
                <div className={styles.cardCounter}>
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
                    {isDeckLoading || !currentCard ? (
                        !currentCategory ? (
                            <div className="all-done-message">Selecciona una categoría.</div>
                        ) : (
                            <div className="loading-container"><img src="/loading.gif" alt="Cargando..." /></div>
                        )
                    ) : (
                        filteredData.length === 0 && masterData.length > 0 ? (
                            <div className="all-done-message">¡Deck '{currentDeckName}' completado! 🎉</div>
                        ) : (
                            <Flashcard key={`${currentCategory}-${currentDeckName}-${currentCard.id}`} />
                        )
                    )}



                    <Controls />
                </div>
            </div>
        </div>
    );
}