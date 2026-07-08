import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import config from '../../config';
import { getDashboardTranslations } from './config/translations';
import { useLearningStats } from './hooks/useLearningStats';
import DashboardHero from './features/DashboardHero';
import './DashboardHome.css';
import { getCourseDirectionFromStudyLanguage } from '../flashcards/useCases/deckUseCases';

export default function DashboardHome() {
    const { user, isAuthenticated } = useAuth();
    const { language = 'en', studyLanguage = 'en' } = useAppContext();
    const t = getDashboardTranslations(language);
    const courseDirection = getCourseDirectionFromStudyLanguage(studyLanguage);
    const { stats, loading: statsLoading } = useLearningStats(
        isAuthenticated && config.features.flashcards,
        courseDirection,
    );

    const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || '';

    return (
        <div className="dashboard-home shell-content-inner">
            {config.features.flashcards && (
                <DashboardHero
                    stats={stats}
                    statsLoading={statsLoading}
                    labels={t}
                    language={language}
                    userName={firstName}
                />
            )}
        </div>
    );
}
