import React from 'react';
import './Layout.css';
import ToneSelector from '../../features/flashcards/ToneSelector';
import FloatingMenu from '../../components/layout/FloatingMenu';
import { FaBars } from 'react-icons/fa';
import LanguageSelector from '../common/LanguageSelector';
import { useAppContext } from '../../context/AppContext';

const ChevronDownIcon = () => (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
);

const AppLogo = () => <div className="app-logo"></div>;

export default function Header() {
    const { 
        isSidebarOpen, setIsSidebarOpen,
        language, setLanguage,
        isHeaderManualOpen, setIsHeaderManualOpen
    } = useAppContext();

    return (
        <header className={`app-header ${isSidebarOpen ? 'sidebar-open' : ''} ${isHeaderManualOpen ? 'manual-open' : ''}`}>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="hamburger-btn">
                <FaBars size={24} color="#ffffff" />
            </button>

            <AppLogo />

            <div className="header-controls">
                <div className="tone-selector-wrapper">
                    <ToneSelector />
                </div>

                <div className="language-selector-wrapper">
                    <LanguageSelector
                        currentLanguage={language}
                        onLanguageChange={setLanguage}
                    />
                </div>
                <div className="menu-wrapper">
                    <FloatingMenu />
                </div>
            </div>

            <div className="header-handle" onClick={() => setIsHeaderManualOpen(!isHeaderManualOpen)}>
                <ChevronDownIcon />
            </div>
        </header>
    );
}
