import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useUIContext } from '../../context/UIContext';
import config from '../../config';
import { getPublicEntryPathForConfig } from '../../modules';
import PageLoader from './PageLoader';

const LOADING_COPY = {
    es: {
        restoring_session: {
            title: 'Restaurando sesión',
            subtitle: 'Estamos preparando tu acceso.',
            status: 'Recuperando tus datos guardados...',
            progress: 42,
        },
        syncing_session: {
            title: 'Validando sesión',
            subtitle: 'Estamos preparando tu acceso.',
            status: 'Sincronizando permisos y credenciales...',
            progress: 78,
        },
        fallback: {
            title: 'Validando acceso',
            subtitle: 'Estamos preparando tu acceso.',
            status: 'Verificando tu sesión...',
            progress: 56,
        },
    },
    en: {
        restoring_session: {
            title: 'Restoring session',
            subtitle: 'We are preparing your access.',
            status: 'Recovering your saved data...',
            progress: 42,
        },
        syncing_session: {
            title: 'Validating session',
            subtitle: 'We are preparing your access.',
            status: 'Syncing permissions and credentials...',
            progress: 78,
        },
        fallback: {
            title: 'Validating access',
            subtitle: 'We are preparing your access.',
            status: 'Checking your session...',
            progress: 56,
        },
    },
};

const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, loading, loadingStage } = useAuth();
    const location = useLocation();
    const { language = 'en' } = useUIContext();
    const locale = language === 'es' ? 'es' : 'en';
    const copy = LOADING_COPY[locale][loadingStage] ?? LOADING_COPY[locale].fallback;

    if (loading) {
        return (
            <PageLoader
                title={copy.title}
                subtitle={copy.subtitle}
                status={copy.status}
                progress={copy.progress}
            />
        );
    }

    if (!isAuthenticated) {
        const entryPath = getPublicEntryPathForConfig(config);
        return (
            <Navigate
                to={entryPath}
                replace
                state={entryPath === '/login' ? { from: location.pathname } : undefined}
            />
        );
    }

    return children;
};

export default ProtectedRoute;
