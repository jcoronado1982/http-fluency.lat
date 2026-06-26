import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiShield } from 'react-icons/fi';
import './Layout.css';
import { useAppContext } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { translations } from '../../../config/translations';
import config from '../../../config';
import { getModuleNavSections } from '../../index';

export default function Sidebar() {
    const { isSidebarOpen: isOpen, language = 'en' } = useAppContext();
    const { isAdmin } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    
    const t = translations[language].sidebar;
    const moduleNavSections = getModuleNavSections(config, { language, isAdmin });
    const isOnboardingTour = new URLSearchParams(location.search).get('onboarding_tour') === 'flashcards';

    const resolveTo = (to) => {
        if (!isOnboardingTour) return to;
        const separator = to.includes('?') ? '&' : '?';
        return `${to}${separator}onboarding_tour=flashcards`;
    };

    const goTo = (to) => (event) => {
        event.preventDefault();
        const target = resolveTo(to);
        if (`${location.pathname}${location.search}` !== target) {
            navigate(target);
        }
    };

    return (
        <aside className={`app-sidebar ${isOpen ? 'open' : 'closed'}`}>
            <nav>
                <ul className="mainNav">
                    {moduleNavSections.map((section, sectionIndex) => (
                        <React.Fragment key={section.id}>
                            {sectionIndex > 0 && <div className="menuDivider" />}
                            <span className="menuSectionLabel">{section.label}</span>
                            {section.items.map((item) => (
                                <li key={item.id}>
                                    <a
                                        href={resolveTo(item.to)}
                                        onClick={goTo(item.to)}
                                        className={`nav-link ${location.pathname === item.to ? 'active' : ''}`}
                                        data-tour={item.id === 'flashcards' ? 'flashcards-nav' : undefined}
                                    >
                                        <span className={`sidebarIcon ${item.color}`}>{item.icon}</span>
                                        <span className="optionText">
                                            <span className="optionName">{item.name}</span>
                                            <span className="optionSub">{item.sub}</span>
                                        </span>
                                    </a>
                                </li>
                            ))}
                        </React.Fragment>
                    ))}

                    {config.features.admin && isAdmin && (
                        <>
                            <div className="menuDivider" />
                            <span className="menuSectionLabel">{t.admin}</span>
                            <li>
                                <a
                                    href="/admin"
                                    onClick={goTo('/admin')}
                                    className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}
                                >
                                    <span className="sidebarIcon rose"><FiShield /></span>
                                    <span className="optionText">
                                        <span className="optionName">{t.users}</span>
                                        <span className="optionSub">{t.realtimeActivity}</span>
                                    </span>
                                </a>
                            </li>
                        </>
                    )}
                </ul>
            </nav>
        </aside>
    );
}
