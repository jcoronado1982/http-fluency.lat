import React from 'react';
import IpaModal from '../../features/flashcards/IpaModal';
import PhonicsModal from '../../features/flashcards/PhonicsModal';
import { useUIContext } from '../../context/UIContext';

/** Modales globales que no dependen del contexto de flashcards. CategorySelector vive en FlashcardPage (dentro de providers). */
export default function FlashcardOverlays() {
    const {
        isIpaModalOpen,
        isPhonicsModalOpen,
        setIsIpaModalOpen,
    } = useUIContext();

    return (
        <>
            {isIpaModalOpen && <IpaModal onClose={() => setIsIpaModalOpen(false)} />}
            {isPhonicsModalOpen && <PhonicsModal />}
        </>
    );
}
