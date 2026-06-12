import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { FiLayers, FiCreditCard, FiCheckSquare, FiBook, FiShield } from 'react-icons/fi';
import './Layout.css';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import config from '../../config';
import { translations } from '../../config/translations';

export default function Sidebar() {
    const { isSidebarOpen: isOpen, language = 'en' } = useAppContext();
    const { isAdmin } = useAuth();
    const location = useLocation();
    
    const t = translations[language].sidebar;

    // 🎯 Determina si la ruta actual es /flashcard o una subruta de flashcards
    const isFlashcardsPath = location.pathname.startsWith('/flashcard');

    return (
        <aside className={`app-sidebar ${isOpen ? 'open' : 'closed'}`}>
            <nav>
                <ul className="mainNav">
                    {/* ── APRENDER ── */}
                    <span className="menuSectionLabel">{t.learn}</span>
                    <li>
                        <NavLink 
                            to="/flashcard" 
                            className={({ isActive }) => `nav-link ${isActive || isFlashcardsPath ? 'active' : ''}`}
                        >
                            <span className="sidebarIcon teal"><FiLayers /></span>
                            <span className="optionText">
                                <span className="optionName">{t.flashcards}</span>
                                <span className="optionSub">{t.wordCollections}</span>
                            </span>
                        </NavLink>
                    </li>

                    <div className="menuDivider" />

                    {/* ── PRONOMBRES ── */}
                    <span className="menuSectionLabel">{t.pronouns}</span>
                    <li>
                        <NavLink
                            to="/pronoun-reference"
                            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                        >
                            <span className="sidebarIcon purple"><FiBook /></span>
                            <span className="optionText">
                                <span className="optionName">{t.table}</span>
                                <span className="optionSub">{t.pronounsReference}</span>
                            </span>
                        </NavLink>
                    </li>
                    {config.features.storyArcade && (
                        <li>
                            <NavLink
                                to="/pronoun-practice"
                                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            >
                                <span className="sidebarIcon amber"><FiCheckSquare /></span>
                                <span className="optionText">
                                    <span className="optionName">{t.practiceMenu}</span>
                                    <span className="optionSub">{t.pronounPractice}</span>
                                </span>
                            </NavLink>
                        </li>
                    )}

                    {isAdmin && (
                        <>
                            <div className="menuDivider" />
                            <span className="menuSectionLabel">{t.admin}</span>
                            <li>
                                <NavLink
                                    to="/admin"
                                    className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                                >
                                    <span className="sidebarIcon rose"><FiShield /></span>
                                    <span className="optionText">
                                        <span className="optionName">{t.users}</span>
                                        <span className="optionSub">{t.realtimeActivity}</span>
                                    </span>
                                </NavLink>
                            </li>
                        </>
                    )}
                </ul>
            </nav>
        </aside>
    );
}
