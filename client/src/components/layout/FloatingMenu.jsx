// FloatingMenu.jsx

import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./FloatingMenu.css";
import { useAppContext } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { translations } from "../../config/translations";
import config from "../../config";
import { getModuleFloatingMenuItems } from "../../modules";

const VOWELS_URL = "https://www.youtube.com/watch?v=JuFBtVFbtkA&t=60s";
const DIPHTHONGS_URL = "https://www.youtube.com/watch?v=JuFBtVFbtkA&t=421s";
const CONSONANTS_URL = "https://www.youtube.com/watch?v=JuFBtVFbtkA&t=600s";

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

    const close = () => { setIsOpen(false); setShowPronun(false); };

    const moduleFloatingItems = getModuleFloatingMenuItems(config, {
        language,
        navigate,
        location,
        close,
    });

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

                {moduleFloatingItems.length > 0 && (
                    <>
                        {moduleFloatingItems.map((item, index) => (
                            <React.Fragment key={item.id}>
                                {item.sectionLabel && (index === 0 || moduleFloatingItems[index - 1]?.sectionLabel !== item.sectionLabel) && (
                                    <span className="menuSectionLabel">{item.sectionLabel}</span>
                                )}
                                <button className="floatingOption" onClick={item.onClick}>
                                    <span className={`optionIcon ${item.iconColor}`}>{item.icon}</span>
                                    <span className="optionText">
                                        <span className="optionName">{item.name}</span>
                                        <span className="optionSub">{item.sub}</span>
                                    </span>
                                </button>
                            </React.Fragment>
                        ))}
                        <div className="menuDivider" />
                    </>
                )}

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
