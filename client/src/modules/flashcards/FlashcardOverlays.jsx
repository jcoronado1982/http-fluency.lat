import React from 'react';
import CategorySelector from '../../features/flashcards/CategorySelector';
import IpaModal from '../../features/flashcards/IpaModal';
import PhonicsModal from '../../features/flashcards/PhonicsModal';
import { useUIContext } from '../../context/UIContext';

export default function FlashcardOverlays() {
    const {
        isCatalogVisible,
        isIpaModalOpen,
        isPhonicsModalOpen,
        setIsIpaModalOpen,
    } = useUIContext();

    return (
        <>
            {isCatalogVisible && <CategorySelector />}
            {isIpaModalOpen && <IpaModal onClose={() => setIsIpaModalOpen(false)} />}
            {isPhonicsModalOpen && <PhonicsModal />}
        </>
    );
}
