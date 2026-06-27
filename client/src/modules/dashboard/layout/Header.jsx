import React from 'react';
import './Layout.css';
import FloatingMenu from './FloatingMenu';
import { FaBars } from 'react-icons/fa';
import LanguageSelector from '../../../components/common/LanguageSelector';
import { useAppContext } from '../../../context/AppContext';

const AppLogo = () => (
    <div className="app-logo">
        <img src="/logo.avif" alt="Fluency" className="app-logo-img" />
    </div>
);

export default function Header() {
    const { 
        isSidebarOpen, setIsSidebarOpen,
        language, setLanguage,
        isHeaderManualOpen,
        isHeaderSuppressed,
    } = useAppContext();

    if (isHeaderSuppressed) {
        return null;
    }

    return (
        <header className={`app-header ${isSidebarOpen ? 'sidebar-open' : ''} ${isHeaderManualOpen ? 'manual-open' : ''}`}>
            <div className="header-left">
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="hamburger-btn"
                    data-tour="menu-hamburguesa"
                    aria-label={language === 'es' ? 'Abrir menú lateral' : 'Open side menu'}
                    aria-expanded={isSidebarOpen}
                >
                    <FaBars size={24} color="#ffffff" />
                </button>
                <AppLogo />
            </div>

            <div className="header-controls">
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
        </header>
    );
}
