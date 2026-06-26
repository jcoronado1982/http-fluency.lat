import React, { createContext, useContext } from 'react';
import { FlashcardContext as StudyFlashcardContext } from '../../../components/flashcardStudy/context/flashcardStudyContext';
import { useDeckSession } from '../hooks/useDeckSession';

export const FlashcardContext = StudyFlashcardContext;
export const useFlashcardContext = () => useContext(FlashcardContext);

export const FlashcardProvider = ({ children, resumeSession = null }) => {
    const value = useDeckSession(resumeSession);
    return <FlashcardContext.Provider value={value}>{children}</FlashcardContext.Provider>;
};
