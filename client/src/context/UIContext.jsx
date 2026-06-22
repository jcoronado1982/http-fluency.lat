import React, { createContext, useContext, useState, useCallback } from 'react';

// Estado de UI global: modales, sidebar, mensajes, idioma
const UIContext = createContext();

export const UIProvider = ({ children }) => {
    const [appMessageState, setAppMessageState]     = useState({ text: '', isError: false });

    const setAppMessage = useCallback((msg) => {
        if (msg?.isError) {
            console.error(`[App Error]: ${msg.text}`);
        }
        setAppMessageState(msg);
    }, []);

    const appMessage = appMessageState;
    const [language, setLanguage]                   = useState('en');
    const [isSidebarOpen, setIsSidebarOpen]         = useState(false);
    const [isCatalogVisible, setIsCatalogVisible]   = useState(false);
    const [isIpaModalOpen, setIsIpaModalOpen]       = useState(false);
    const [isPhonicsModalOpen, setIsPhonicsModalOpen] = useState(false);
    const [isAudioLoading, setIsAudioLoading]       = useState(false);
    const [isFloatingMenuOpen, setIsFloatingMenuOpen] = useState(false);
    const [isHeaderManualOpen, setIsHeaderManualOpen] = useState(true);
    const [isMainLoadingBlocked, setIsMainLoadingBlocked] = useState(false);

    return (
        <UIContext.Provider value={{
            appMessage, setAppMessage,
            language, setLanguage,
            isSidebarOpen, setIsSidebarOpen,
            isCatalogVisible, setIsCatalogVisible,
            isIpaModalOpen, setIsIpaModalOpen,
            isPhonicsModalOpen, setIsPhonicsModalOpen,
            isAudioLoading, setIsAudioLoading,
            isFloatingMenuOpen, setIsFloatingMenuOpen,
            isHeaderManualOpen, setIsHeaderManualOpen,
            isMainLoadingBlocked, setIsMainLoadingBlocked,
        }}>
            {children}
        </UIContext.Provider>
    );
};

export const useUIContext = () => useContext(UIContext);
