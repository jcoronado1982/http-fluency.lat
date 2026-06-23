import React from 'react';
import { FiLayers } from 'react-icons/fi';
import ProtectedRoute from '../../components/common/ProtectedRoute';
import FlashcardPage from './FlashcardPage';
import FlashcardOverlays from './FlashcardOverlays';
import { CategoryProvider } from './context/CategoryContext';
import { FlashcardProvider } from './context/FlashcardContext';
import { FlashcardUiProvider } from './context/FlashcardUiContext';
import { getFlashcardUiBridge } from './uiBridge';
import { getFlashcardFloatingMenuLabels, getFlashcardSidebarLabels } from './config/translations';
import { isDefaultHomeModule } from '../index';

const IconVowelChart = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#7f77dd" strokeWidth="2.2">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 9h16" />
        <path d="M9 4v16" />
    </svg>
);

function FlashcardRouteLayout({ children }) {
    return (
        <CategoryProvider>
            <FlashcardProvider>
                {children}
            </FlashcardProvider>
        </CategoryProvider>
    );
}

const flashcardsModule = {
    id: 'flashcards',
    enabled: (config) => config.features.flashcards,
    routes: (config) => {
        if (!config.features.flashcards) return [];
        const path = isDefaultHomeModule('flashcards', config) ? '/' : '/flashcard';
        const flashcardElement = (
            <ProtectedRoute>
                <FlashcardRouteLayout>
                    <FlashcardPage />
                </FlashcardRouteLayout>
            </ProtectedRoute>
        );
        return [{ path, element: flashcardElement }];
    },
    navSections: ({ language, config }) => {
        if (!config.features.flashcards) return [];
        const t = getFlashcardSidebarLabels(language);
        const to = isDefaultHomeModule('flashcards', config) ? '/' : '/flashcard';
        return [{
            id: 'flashcards',
            label: t.learn,
            items: [{
                id: 'flashcards',
                to,
                icon: <FiLayers />,
                color: 'teal',
                name: t.flashcards,
                sub: t.wordCollections,
            }],
        }];
    },
    overlays: () => <FlashcardOverlays />,
    shellProviders: (config) => (config.features.flashcards ? [FlashcardUiProvider] : []),
    floatingMenuItems: ({ language, config, navigate, location, close }) => {
        if (!config.features.flashcards) return [];
        const t = getFlashcardFloatingMenuLabels(language);
        const { openCatalog, openIpa } = getFlashcardUiBridge();
        const homePath = isDefaultHomeModule('flashcards', config) ? '/' : '/flashcard';
        const goHomeWithState = (state) => {
            if (location.pathname !== homePath) {
                navigate(homePath, { state });
            }
            return location.pathname === homePath;
        };
        return [
            {
                id: 'flashcards-categories',
                sectionLabel: t.learn,
                onClick: () => {
                    close();
                    const onHome = goHomeWithState({ openCatalog: true });
                    if (onHome && openCatalog) openCatalog();
                },
                icon: <FiLayers />,
                iconColor: 'teal',
                name: t.categories,
                sub: t.wordCollections,
            },
            {
                id: 'flashcards-ipa',
                onClick: () => {
                    close();
                    const onHome = goHomeWithState({ openIpa: true });
                    if (onHome && openIpa) openIpa();
                },
                icon: <IconVowelChart />,
                iconColor: 'purple',
                name: t.vowelChart,
                sub: t.referenceChart,
            },
        ];
    },
};

export default flashcardsModule;
