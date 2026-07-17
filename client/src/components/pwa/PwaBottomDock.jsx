import React, { useState } from 'react';
import { LuBookOpen, LuLanguages, LuLayers, LuLayoutDashboard } from 'react-icons/lu';
import styles from './PwaBottomDock.module.css';

const COPY = {
    es: {
        dashboard: 'Dashboard',
        flashcards: 'Flashcards',
        studyLanguage: 'Idioma de estudio',
        categories: 'Categorías',
        english: 'Inglés',
        spanish: 'Español',
        navigation: 'Navegación de la aplicación',
    },
    en: {
        dashboard: 'Dashboard',
        flashcards: 'Flashcards',
        studyLanguage: 'Study language',
        categories: 'Categories',
        english: 'English',
        spanish: 'Spanish',
        navigation: 'App navigation',
    },
};

export default function PwaBottomDock({
    language = 'en',
    studyLanguage = 'en',
    onPrimary,
    onDashboard,
    onCatalog,
    onStudyLanguageChange,
    primaryDestination = 'dashboard',
}) {
    const t = COPY[language] ?? COPY.en;
    const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
    const PrimaryIcon = primaryDestination === 'flashcards' ? LuBookOpen : LuLayoutDashboard;
    const primaryLabel = primaryDestination === 'flashcards' ? t.flashcards : t.dashboard;

    const selectStudyLanguage = (nextLanguage) => {
        onStudyLanguageChange?.(nextLanguage);
        setIsLanguageMenuOpen(false);
    };

    return (
        <div className={styles.pwaDockRoot}>
            {isLanguageMenuOpen && (
                <div className={styles.languagePopover} role="group" aria-label={t.studyLanguage}>
                    <button
                        type="button"
                        className={studyLanguage === 'en' ? styles.selectedLanguage : ''}
                        onClick={() => selectStudyLanguage('en')}
                        aria-pressed={studyLanguage === 'en'}
                    >
                        {t.english}
                    </button>
                    <button
                        type="button"
                        className={studyLanguage === 'es' ? styles.selectedLanguage : ''}
                        onClick={() => selectStudyLanguage('es')}
                        aria-pressed={studyLanguage === 'es'}
                    >
                        {t.spanish}
                    </button>
                </div>
            )}

            <nav className={styles.studyDock} aria-label={t.navigation}>
                <button type="button" className={styles.dockItem} onClick={onPrimary ?? onDashboard}>
                    <PrimaryIcon aria-hidden="true" />
                    <span>{primaryLabel}</span>
                </button>
                <button
                    type="button"
                    className={`${styles.dockItem} ${isLanguageMenuOpen ? styles.active : ''}`}
                    onClick={() => setIsLanguageMenuOpen((isOpen) => !isOpen)}
                    aria-expanded={isLanguageMenuOpen}
                >
                    <LuLanguages aria-hidden="true" />
                    <span>{t.studyLanguage}</span>
                </button>
                <button type="button" className={styles.dockItem} onClick={onCatalog}>
                    <LuLayers aria-hidden="true" />
                    <span>{t.categories}</span>
                </button>
            </nav>
        </div>
    );
}
