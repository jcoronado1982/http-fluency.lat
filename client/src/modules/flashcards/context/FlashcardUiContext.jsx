import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { registerFlashcardUiBridge } from '../uiBridge';

const FlashcardUiContext = createContext();

/** Estado de UI exclusivo del módulo flashcards (no pertenece al shell). */
export const FlashcardUiProvider = ({ children }) => {
    const [isCatalogVisible, setIsCatalogVisible] = useState(false);
    const [isIpaModalOpen, setIsIpaModalOpen] = useState(false);
    const [isPhonicsModalOpen, setIsPhonicsModalOpen] = useState(false);
    const [isAudioLoading, setIsAudioLoading] = useState(false);

    const openCatalog = useCallback(() => setIsCatalogVisible(true), []);
    const openIpa = useCallback(() => setIsIpaModalOpen(true), []);
    const openPhonics = useCallback(() => setIsPhonicsModalOpen(true), []);

    useEffect(() => {
        registerFlashcardUiBridge({ openCatalog, openIpa, openPhonics });
        return () => registerFlashcardUiBridge({ openCatalog: null, openIpa: null, openPhonics: null });
    }, [openCatalog, openIpa, openPhonics]);

    return (
        <FlashcardUiContext.Provider value={{
            isCatalogVisible, setIsCatalogVisible,
            isIpaModalOpen, setIsIpaModalOpen,
            isPhonicsModalOpen, setIsPhonicsModalOpen,
            isAudioLoading, setIsAudioLoading,
            openCatalog, openIpa, openPhonics,
        }}>
            {children}
        </FlashcardUiContext.Provider>
    );
};

export const useFlashcardUiContext = () => useContext(FlashcardUiContext);
