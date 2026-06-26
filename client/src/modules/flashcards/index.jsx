import React from 'react';
import { useLocation } from 'react-router-dom';
import { FiLayers } from 'react-icons/fi';
import ProtectedRoute from '../../components/common/ProtectedRoute';
import FlashcardPage from './FlashcardPage';
import FlashcardOverlays from './FlashcardOverlays';
import { CategoryProvider } from './context/CategoryContext';
import { FlashcardProvider } from './context/FlashcardContext';
import { FlashcardUiProvider } from './context/FlashcardUiContext';
import { getFlashcardFloatingMenuLabels, getFlashcardSidebarLabels } from './config/translations';
import { readResumeSession } from './config/sessionKeys';
import { invokeUiBridge } from './uiBridge';
import { StudyMediaProvider } from '../../components/flashcardStudy';
import { STUDY_MEDIA_VARIANT_APP } from '../../contracts/studyMediaVariants';
import { audioPort, imagePort, imageCompressionService } from './composition';
import { isDefaultHomeModule } from '../index';

const IconVowelChart = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#7f77dd" strokeWidth="2.2">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 9h16" />
        <path d="M9 4v16" />
    </svg>
);

function FlashcardRouteLayout({ children }) {
    const location = useLocation();
    const resumeSession = location.state?.resumeSession ?? null;

    return (
        <CategoryProvider resumeSession={resumeSession}>
            <FlashcardProvider resumeSession={resumeSession}>
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
    overlays: () => (
        <StudyMediaProvider
            mediaVariant={STUDY_MEDIA_VARIANT_APP}
            audioPort={audioPort}
            imagePort={imagePort}
            imageCompressionService={imageCompressionService}
        >
            <FlashcardOverlays />
        </StudyMediaProvider>
    ),
    shellProviders: (config) => (config.features.flashcards ? [FlashcardUiProvider] : []),
    readResumeSession,
    floatingMenuItems: ({ language, config, navigate, close, location }) => {
        if (!config.features.flashcards) return [];
        const t = getFlashcardFloatingMenuLabels(language);
        const homePath = isDefaultHomeModule('flashcards', config) ? '/' : '/flashcard';
        const openFromShell = (action, state) => {
            close();
            const onHome = location?.pathname === homePath;
            if (onHome && invokeUiBridge(action)) return;
            navigate(homePath, { state });
        };
        return [
            {
                id: 'flashcards-categories',
                sectionLabel: t.learn,
                onClick: () => openFromShell('openCatalog', { openCatalog: true }),
                icon: <FiLayers />,
                iconColor: 'teal',
                name: t.categories,
                sub: t.wordCollections,
            },
            {
                id: 'flashcards-ipa',
                onClick: () => openFromShell('openIpa', { openIpa: true }),
                icon: <IconVowelChart />,
                iconColor: 'purple',
                name: t.vowelChart,
                sub: t.referenceChart,
            },
        ];
    },
};

export default flashcardsModule;
