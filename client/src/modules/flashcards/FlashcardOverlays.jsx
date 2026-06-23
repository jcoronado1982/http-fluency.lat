import React from 'react';
import IpaModal from './features/IpaModal';
import PhonicsModal from './features/PhonicsModal';
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
