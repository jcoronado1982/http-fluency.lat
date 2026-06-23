import React, { createContext, useContext } from 'react';
import { useDeckSession } from '../hooks/useDeckSession';

const FlashcardContext = createContext();

export const FlashcardProvider = ({ children }) => {
    const value = useDeckSession();
    return <FlashcardContext.Provider value={value}>{children}</FlashcardContext.Provider>;
};

export const useFlashcardContext = () => useContext(FlashcardContext);
