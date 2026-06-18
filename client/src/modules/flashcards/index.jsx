import React from 'react';
import { FiLayers } from 'react-icons/fi';
import ProtectedRoute from '../../components/common/ProtectedRoute';
import FlashcardPage from './FlashcardPage';
import FlashcardOverlays from './FlashcardOverlays';
import { CategoryProvider } from './context/CategoryContext';
import { FlashcardProvider } from './context/FlashcardContext';
import { isDefaultHomeModule } from '../index';

const IconFlashcard = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#1d9e75" strokeWidth="2.2">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 9h18" />
        <path d="M9 5v4" />
        <path d="M15 5v4" />
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
        const goHome = () => {
            if (location.pathname !== homePath) navigate(homePath);
        };
        return [
            {
                id: 'flashcards-categories',
                sectionLabel: t.learn,
                onClick: () => {
                    goHome();
                    setIsCatalogVisible(true);
                    close();
                },
                icon: <IconFlashcard />,
                iconColor: 'teal',
                name: t.categories,
                sub: t.wordCollections,
            },
            {
                id: 'flashcards-ipa',
                onClick: () => {
                    goHome();
                    setIsIpaModalOpen(true);
                    close();
                },
                icon: <IconFlashcard />,
                iconColor: 'purple',
                name: t.vowelChart,
                sub: t.referenceChart,
            },
        ];
    },
};

export default flashcardsModule;
