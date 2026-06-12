import React, { createContext, useContext, useState, useCallback } from 'react';

// Estado de UI global: modales, sidebar, mensajes, tono, idioma
const UIContext = createContext();

const toneOptions = [
    { id: 'presenter', label: 'Presentador', value: 'Read this like a news anchor: ' },
    { id: 'casual',    label: 'Casual',      value: 'Read this casually, like talking to a friend: ' },
    { id: 'clear',     label: 'Claro',       value: 'Read clearly: ' },
    { id: 'formal',    label: 'Formal',      value: 'Say in a formal and informative tone: ' },
    { id: 'fast',      label: 'Rápido',      value: 'Say quickly and urgently: ' },
];

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
    const [selectedTone, setSelectedTone]           = useState(toneOptions[0].value);
    const [isSidebarOpen, setIsSidebarOpen]         = useState(false);
    const [isCatalogVisible, setIsCatalogVisible]   = useState(false);
    const [isIpaModalOpen, setIsIpaModalOpen]       = useState(false);
    const [isPhonicsModalOpen, setIsPhonicsModalOpen] = useState(false);
    const [isAudioLoading, setIsAudioLoading]       = useState(false);
    const [isFloatingMenuOpen, setIsFloatingMenuOpen] = useState(false);
    const [isHeaderManualOpen, setIsHeaderManualOpen] = useState(false);

    return (
        <UIContext.Provider value={{
            appMessage, setAppMessage,
            language, setLanguage,
            selectedTone, setSelectedTone, toneOptions,
            isSidebarOpen, setIsSidebarOpen,
            isCatalogVisible, setIsCatalogVisible,
            isIpaModalOpen, setIsIpaModalOpen,
            isPhonicsModalOpen, setIsPhonicsModalOpen,
            isAudioLoading, setIsAudioLoading,
            isFloatingMenuOpen, setIsFloatingMenuOpen,
            isHeaderManualOpen, setIsHeaderManualOpen,
        }}>
            {children}
        </UIContext.Provider>
    );
};

export const useUIContext = () => useContext(UIContext);
