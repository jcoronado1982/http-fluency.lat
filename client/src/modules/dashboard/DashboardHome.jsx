import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import PwaBottomDock from '../../components/pwa/PwaBottomDock';
import config from '../../config';
import { isDefaultHomeModule } from '../index';
import { getDashboardTranslations } from './config/translations';
import { useLearningStats } from './hooks/useLearningStats';
import DashboardHero from './features/DashboardHero';
import PageLoader from '../../components/common/PageLoader';
import './DashboardHome.css';
import { getCourseDirectionFromStudyLanguage } from '../../contracts/courseDirection.js';

export default function DashboardHome() {
    const navigate = useNavigate();
    const { user, isAuthenticated, updateStudyLanguage } = useAuth();
    const { language = 'en', studyLanguage = 'en', setStudyLanguage } = useAppContext();
    const t = getDashboardTranslations(language);
    const courseDirection = getCourseDirectionFromStudyLanguage(studyLanguage);
    const { stats, loading: statsLoading } = useLearningStats(
        isAuthenticated && config.features.flashcards,
        courseDirection,
    );

    const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || '';
    const flashcardPath = isDefaultHomeModule('flashcards', config) ? '/' : '/flashcard';
    const handleStudyLanguageChange = (nextLanguage) => {
        if (nextLanguage === studyLanguage) return;
        setStudyLanguage(nextLanguage);
        void updateStudyLanguage(nextLanguage);
    };

    if (statsLoading) {
        const title = language === 'es' ? 'Cargando Estadísticas' : 'Loading Stats';
        const subtitle = language === 'es' ? 'Preparando tu panel de aprendizaje' : 'Preparing your learning dashboard';
        const status = language === 'es' ? 'Obteniendo progreso...' : 'Fetching progress...';
        return (
            <PageLoader
                title={title}
                subtitle={subtitle}
                status={status}
                progress={50}
            />
        );
    }

    return (
        <div className="dashboard-home shell-content-inner">
            {config.features.flashcards && (
                <>
                    <DashboardHero
                        stats={stats}
                        statsLoading={statsLoading}
                        labels={t}
                        language={language}
                        userName={firstName}
                        userEmail={user?.email}
                        courseDirection={courseDirection}
                    />
                    <PwaBottomDock
                        language={language}
                        studyLanguage={studyLanguage}
                        primaryDestination="flashcards"
                        onPrimary={() => navigate(flashcardPath)}
                        onCatalog={() => navigate(flashcardPath, { state: { openCatalog: true } })}
                        onStudyLanguageChange={handleStudyLanguageChange}
                    />
                </>
            )}
        </div>
    );
}
