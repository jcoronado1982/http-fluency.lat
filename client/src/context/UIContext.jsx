import React, { createContext, useContext, useState, useCallback } from 'react';
import { detectBrowserLanguage } from '../utils/browserLanguage';

// Estado de UI global del shell (sin estado de módulos de negocio)
const UIContext = createContext();
const STUDY_LANGUAGE_KEY = 'study_language';

function getInitialStudyLanguage() {
    if (typeof window === 'undefined') return 'en';
    const saved = window.localStorage.getItem(STUDY_LANGUAGE_KEY);
    if (saved === 'es' || saved === 'en') return saved;
    return 'en';
}

export const UIProvider = ({ children }) => {
    const [appMessageState, setAppMessageState] = useState({ text: '', isError: false });

    const setAppMessage = useCallback((msg) => {
        if (msg?.isError) {
            console.error(`[App Error]: ${msg.text}`);
        }
        setAppMessageState(msg);
    }, []);

    const appMessage = appMessageState;
    const [language, setLanguage] = useState(() => detectBrowserLanguage());
    const [studyLanguageState, setStudyLanguageState] = useState(() => getInitialStudyLanguage());
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isFloatingMenuOpen, setIsFloatingMenuOpen] = useState(false);
    const [isHeaderManualOpen, setIsHeaderManualOpen] = useState(true);
    const [isHeaderSuppressed, setIsHeaderSuppressed] = useState(false);

    const setStudyLanguage = useCallback((nextLanguage) => {
        const normalized = nextLanguage === 'es' ? 'es' : 'en';
        setStudyLanguageState(normalized);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(STUDY_LANGUAGE_KEY, normalized);
        }
    }, []);

    return (
        <UIContext.Provider value={{
            appMessage, setAppMessage,
            language, setLanguage,
            studyLanguage: studyLanguageState,
            setStudyLanguage,
            isSidebarOpen, setIsSidebarOpen,
            isFloatingMenuOpen, setIsFloatingMenuOpen,
            isHeaderManualOpen, setIsHeaderManualOpen,
            isHeaderSuppressed, setIsHeaderSuppressed,
        }}>
            {children}
        </UIContext.Provider>
    );
};

export const useUIContext = () => useContext(UIContext);
