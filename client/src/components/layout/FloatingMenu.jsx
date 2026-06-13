// FloatingMenu.jsx

import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./FloatingMenu.css";
import { useAppContext } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { translations } from "../../config/translations";

const VOWELS_URL = "https://www.youtube.com/watch?v=JuFBtVFbtkA&t=60s";
const DIPHTHONGS_URL = "https://www.youtube.com/watch?v=JuFBtVFbtkA&t=421s";
const CONSONANTS_URL = "https://www.youtube.com/watch?v=JuFBtVFbtkA&t=600s";

const IconFlashcard = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#1d9e75" strokeWidth="2.2">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 9h18" />
        <path d="M9 5v4" />
        <path d="M15 5v4" />
    </svg>
);

const IconPronouns = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#7f77dd" strokeWidth="2.2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
);

const IconStory = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#ef9f27" strokeWidth="2.2">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
);

const IconPronunciation = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#378add" strokeWidth="2.2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
);

const FloatingMenu = () => {
    const {
        setIsCatalogVisible,
        setIsIpaModalOpen,
        setIsPhonicsModalOpen,
        isFloatingMenuOpen: isOpen,
        setIsFloatingMenuOpen: setIsOpen,
        language = 'en'
    } = useAppContext();
    const { user, logout } = useAuth();
    const [showPronun, setShowPronun] = useState(false);
    const containerRef = useRef(null);
    const navigate = useNavigate();
    const location = useLocation();
    
    const t = translations[language].floatingMenu;

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
                setShowPronun(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [setIsOpen]);

    const close = () => { setIsOpen(false); setShowPronun(false); };

    const openExternal = (url) => { window.open(url, "_blank"); close(); };

    return (
        <div className="floatingMenuContainer" ref={containerRef}>

            <button
                className="floatingMainButton"
                onClick={() => { setIsOpen(!isOpen); setShowPronun(false); }}
                aria-label="Menú"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                </svg>
            </button>

            <div className={`floatingOptions ${isOpen ? "show" : ""}`}>

                {/* ── APRENDER ── */}
                <span className="menuSectionLabel">{t.learn}</span>

                <button
                    className="floatingOption"
                    onClick={() => { 
                        if (location.pathname !== '/flashcard') navigate('/flashcard');
                        setIsCatalogVisible(true); 
                        close(); 
                    }}
                >
                    <span className="optionIcon teal"><IconFlashcard /></span>
                    <span className="optionText">
                        <span className="optionName">{t.categories}</span>
                        <span className="optionSub">{t.wordCollections}</span>
                    </span>
                </button>

                <button
                    className="floatingOption"
                    onClick={() => { 
                        if (location.pathname !== '/flashcard') navigate('/flashcard');
                        setIsIpaModalOpen(true); 
                        close(); 
                    }}
                >
                    <span className="optionIcon purple"><IconPronouns /></span>
                    <span className="optionText">
                        <span className="optionName">{t.vowelChart}</span>
                        <span className="optionSub">{t.referenceChart}</span>
                    </span>
                </button>

                <div className="menuDivider" />

                {/* ── REFERENCIAS ── */}
                <span className="menuSectionLabel">{t.practice}</span>

                {/* Pronunciación con submenu inline */}
                <button
                    className={`floatingOption ${showPronun ? "active" : ""}`}
                    onClick={() => setShowPronun(!showPronun)}
                >
                    <span className="optionIcon blue"><IconPronunciation /></span>
                    <span className="optionText">
                        <span className="optionName">{t.pronunciation}</span>
                        <span className="optionSub">
                            {showPronun ? t.close : t.pronunciationSub}
                        </span>
                    </span>
                </button>

                {showPronun && (
                    <>
                        <button
                            className="floatingOption submenuItem"
                            onClick={() => openExternal(VOWELS_URL)}
                        >
                            <span className="optionText">
                                <span className="optionName">{t.vowels}</span>
                            </span>
                        </button>
                        <button
                            className="floatingOption submenuItem"
                            onClick={() => openExternal(DIPHTHONGS_URL)}
                        >
                            <span className="optionText">
                                <span className="optionName">{t.diphthongs}</span>
                            </span>
                        </button>
                        <button
                            className="floatingOption submenuItem"
                            onClick={() => openExternal(CONSONANTS_URL)}
                        >
                            <span className="optionText">
                                <span className="optionName">{t.consonants}</span>
                            </span>
                        </button>
                    </>
                )}

                <div className="menuDivider" />

                {/* ── CUENTA ── */}
                <span className="menuSectionLabel">{t.account}</span>
                
                <div className="userProfileItem">
                    <img src={user?.picture} alt="User" className="userAvatar" />
                    <div className="userInfo">
                        <span className="userName">{user?.name}</span>
                        <span className="userRole">{user?.role}</span>
                    </div>
                </div>

                <button
                    className="floatingOption logoutBtn"
                    onClick={() => { logout(); close(); }}
                >
                    <span className="optionIcon red">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                    </span>
                    <span className="optionText">
                        <span className="optionName">{t.logout}</span>
                    </span>
                </button>

            </div>
        </div>
    );
};

export default FloatingMenu;