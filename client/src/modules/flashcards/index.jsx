import React from 'react';
import { FiLayers } from 'react-icons/fi';
import ProtectedRoute from '../../components/common/ProtectedRoute';
import FlashcardPage from './FlashcardPage';
import FlashcardOverlays from './FlashcardOverlays';
import { CategoryProvider } from './context/CategoryContext';
import { FlashcardProvider } from './context/FlashcardContext';
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
    navSections: ({ t, config }) => {
        if (!config.features.flashcards) return [];
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
    floatingMenuItems: ({ t, config, navigate, location, close, setIsCatalogVisible, setIsIpaModalOpen }) => {
        if (!config.features.flashcards) return [];
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
                    if (onHome) setIsCatalogVisible(true);
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
                    if (onHome) setIsIpaModalOpen(true);
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
