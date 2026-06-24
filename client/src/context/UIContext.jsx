import React, { createContext, useContext, useState, useCallback } from 'react';

// Estado de UI global del shell (sin estado de módulos de negocio)
const UIContext = createContext();

export const UIProvider = ({ children }) => {
    const [appMessageState, setAppMessageState] = useState({ text: '', isError: false });

    const setAppMessage = useCallback((msg) => {
        if (msg?.isError) {
            console.error(`[App Error]: ${msg.text}`);
        }
        setAppMessageState(msg);
    }, []);

    const appMessage = appMessageState;
    const [language, setLanguage] = useState('en');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isFloatingMenuOpen, setIsFloatingMenuOpen] = useState(false);
    const [isHeaderManualOpen, setIsHeaderManualOpen] = useState(true);
    const [isHeaderSuppressed, setIsHeaderSuppressed] = useState(false);

    return (
        <UIContext.Provider value={{
            appMessage, setAppMessage,
            language, setLanguage,
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
