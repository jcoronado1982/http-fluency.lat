import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { FiLayers, FiCreditCard, FiCheckSquare, FiBook, FiShield } from 'react-icons/fi';
import './Layout.css';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import config from '../../config';


export default function Sidebar() {
    const { isSidebarOpen: isOpen } = useAppContext();
    const { isAdmin } = useAuth();
    const location = useLocation();

    // 🎯 Determina si la ruta actual es /flashcard o una subruta de flashcards
    const isFlashcardsPath = location.pathname.startsWith('/flashcard');



    return (
        <aside className={`app-sidebar ${isOpen ? 'open' : 'closed'}`}>
            <nav>
                <ul className="mainNav">
                    {/* ── APRENDER ── */}
                    <span className="menuSectionLabel">Aprender</span>
                    <li>
                        <NavLink 
                            to="/flashcard" 
                            className={({ isActive }) => `nav-link ${isActive || isFlashcardsPath ? 'active' : ''}`}
                        >
                            <span className="sidebarIcon teal"><FiLayers /></span>
                            <span className="optionText">
                                <span className="optionName">Flashcards</span>
                                <span className="optionSub">Colecciones de palabras</span>
                            </span>
                        </NavLink>
                    </li>

                    <div className="menuDivider" />

                    {/* ── PRONOMBRES ── */}
                    <span className="menuSectionLabel">Pronombres</span>
                    <li>
                        <NavLink
                            to="/courses"
                            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                        >
                            <span className="sidebarIcon purple"><FiBook /></span>
                            <span className="optionText">
                                <span className="optionName">Tabla</span>
                                <span className="optionSub">Referencia de pronombres</span>
                            </span>
                        </NavLink>
                    </li>
                    {config.features.storyArcade && (
                        <li>
                            <NavLink
                                to="/story-arcade"
                                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            >
                                <span className="sidebarIcon amber"><FiCheckSquare /></span>
                                <span className="optionText">
                                    <span className="optionName">Práctica</span>
                                    <span className="optionSub">Story Arcade</span>
                                </span>
                            </NavLink>
                        </li>
                    )}

                    {isAdmin && (
                        <>
                            <div className="menuDivider" />
                            <span className="menuSectionLabel">Admin</span>
                            <li>
                                <NavLink
                                    to="/admin"
                                    className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                                >
                                    <span className="sidebarIcon rose"><FiShield /></span>
                                    <span className="optionText">
                                        <span className="optionName">Users</span>
                                        <span className="optionSub">Real-time activity</span>
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
