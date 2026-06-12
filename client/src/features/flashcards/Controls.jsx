import React from 'react';
import styles from './Controls.module.css';
import { translations } from '../../config/translations';
import { useAppContext } from '../../context/AppContext';
import { useFlashcardContext } from '../../context/FlashcardContext';

function Controls() {
    const { language = 'en', isAudioLoading } = useAppContext();
    const {
        prevCard, nextCard, markAsLearned, resetDeck,
        currentIndex, filteredData, currentDeckName
    } = useFlashcardContext();

    const t = translations[language].controls;
    const totalCards = filteredData.length;
    const isBusy = totalCards === 0 || isAudioLoading;
    const isResetDisabled = isAudioLoading || !currentDeckName;

    const formatName = (name) => {
        if (!name) return '';
        const cleanName = name.replace(/^\d+\s*/, '');
        const spacedName = cleanName.replace(/[_-]/g, ' ');
        return spacedName.charAt(0).toUpperCase() + spacedName.slice(1);
    };

    return (
        <div
            className={styles.controlsWrapper}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
        >
            <div className={styles.controls}>
                <button className={styles.prevCardBtn} onClick={prevCard} disabled={isBusy} title={t.prev}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <button className={styles.resetButton} onClick={resetDeck} disabled={isResetDisabled} title={`${t.reset}: ${currentDeckName ? formatName(currentDeckName) : ''}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                </button>
                <div className={styles.cardCounter}>
                    {totalCards > 0 ? `${currentIndex + 1} / ${totalCards}` : '0 / 0'}
                </div>
                <button className={styles.correctButton} onClick={markAsLearned} disabled={isBusy} title={t.correct}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </button>
                <button className={styles.nextCardBtn} onClick={nextCard} disabled={isBusy} title={t.next}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
            </div>
        </div>
    );
}

export default Controls;
