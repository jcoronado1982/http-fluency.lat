import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useUIContext } from '../../context/UIContext';
import PageLoader from './PageLoader';

const LOADING_COPY = {
    es: {
        restoring_session: {
            title: 'Restaurando sesión',
            subtitle: 'Estamos preparando el panel de administración.',
            status: 'Recuperando tus datos guardados...',
            progress: 36,
        },
        syncing_session: {
            title: 'Validando permisos',
            subtitle: 'Estamos preparando el panel de administración.',
            status: 'Sincronizando permisos de administrador...',
            progress: 76,
        },
        fallback: {
            title: 'Preparando administración',
            subtitle: 'Estamos preparando el panel de administración.',
            status: 'Verificando acceso administrativo...',
            progress: 58,
        },
    },
    en: {
        restoring_session: {
            title: 'Restoring session',
            subtitle: 'We are preparing the admin area.',
            status: 'Recovering your saved data...',
            progress: 36,
        },
        syncing_session: {
            title: 'Validating permissions',
            subtitle: 'We are preparing the admin area.',
            status: 'Syncing administrator permissions...',
            progress: 76,
        },
        fallback: {
            title: 'Preparing admin area',
            subtitle: 'We are preparing the admin area.',
            status: 'Checking administrative access...',
            progress: 58,
        },
    },
};

const AdminRoute = ({ children }) => {
    const { isAuthenticated, loading, loadingStage, role } = useAuth();
    const { language = 'en', setIsMainLoadingBlocked } = useUIContext();
    const locale = language === 'es' ? 'es' : 'en';
    const copy = LOADING_COPY[locale][loadingStage] ?? LOADING_COPY[locale].fallback;

    useEffect(() => {
        setIsMainLoadingBlocked(loading);
        return () => setIsMainLoadingBlocked(false);
    }, [loading, setIsMainLoadingBlocked]);

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
        return <Navigate to="/login" />;
    }

    if (role !== 'admin') {
        return <Navigate to="/" />;
    }

    return children;
};

export default AdminRoute;
