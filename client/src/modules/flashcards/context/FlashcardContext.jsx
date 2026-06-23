import React, { createContext, useContext } from 'react';
import { useDeckSession } from '../hooks/useDeckSession';

export const FlashcardContext = createContext();

export const FlashcardProvider = ({ children, resumeSession = null }) => {
    const value = useDeckSession(resumeSession);
    return <FlashcardContext.Provider value={value}>{children}</FlashcardContext.Provider>;
};

export const useFlashcardContext = () => useContext(FlashcardContext);
