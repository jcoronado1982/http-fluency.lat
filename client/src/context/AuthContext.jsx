import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import config from '../config';
import { getPublicEntryPathForConfig } from '../modules';
import { authRepository } from '../repositories/AuthRepository';
import { httpClient } from '../services/httpClient';
import { usePresence } from '../hooks/usePresence';
import { shouldShowOnboarding, markOnboardingDone, resolveOnboardingCompleted } from '../utils/onboardingStorage';

const AuthContext = createContext();

function PresenceTracker() {
    usePresence();
    return null;
}

export const AuthProvider = ({ children }) => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingStage, setLoadingStage] = useState('restoring_session');
    const onboardingRequired = shouldShowOnboarding(user);

    useEffect(() => {
        const authData = authRepository.getAuthData();
        if (!authData) {
            setLoadingStage(null);
            setLoading(false);
            return;
        }

        setUser(authData.user);
        setLoadingStage('syncing_session');

        httpClient.get('/api/auth/me')
            .then((me) => {
                const onboardingCompleted = resolveOnboardingCompleted(
                    authData.user,
                    me.onboarding_completed === true,
                );
                const nextUser = {
                    ...authData.user,
                    role: me.effective_role || authData.user.role,
                    onboarding_completed: onboardingCompleted,
                };
                authRepository.saveAuthData({ token: authData.token, user: nextUser });
                setUser(nextUser);

                if (onboardingCompleted && me.onboarding_completed !== true) {
                    httpClient.post('/api/auth/onboarding', { completed: true }).catch((err) => {
                        console.warn('No se pudo re-sincronizar onboarding con el servidor:', err);
                    });
                }
            })
            .catch((err) => console.warn('No se pudo sincronizar rol desde /api/auth/me:', err))
            .finally(() => {
                setLoadingStage(null);
                setLoading(false);
            });
    }, []);

    const login = async (idToken) => {
        const data = await authRepository.loginWithGoogle(idToken);
        if (!data.success) return data;

        authRepository.saveAuthData(data);
        setUser(data.user);

        try {
            const me = await httpClient.get('/api/auth/me');
            const syncedUser = {
                ...data.user,
                role: me.effective_role || data.user.role,
                onboarding_completed: resolveOnboardingCompleted(
                    data.user,
                    me.onboarding_completed === true,
                ),
            };
            const next = { ...data, user: syncedUser };
            authRepository.saveAuthData(next);
            setUser(syncedUser);
            return next;
        } catch (err) {
            console.warn('No se pudo sincronizar onboarding desde /api/auth/me:', err);
            return data;
        }
    };

    const loginAsGuest = async () => {
        if (!import.meta.env.DEV) {
            console.warn('Guest login is only available in development mode.');
            return;
        }
        try {
            const data = await authRepository.loginAsDevGuest();
            if (data.success) {
                authRepository.saveAuthData(data);
                setUser(data.user);
            }
            return data;
        } catch (err) {
            console.error('Dev guest login failed:', err);
            return null;
        }
    };

    const logout = () => {
        httpClient.post('/api/presence/leave', {}).catch(() => {});
        authRepository.logout();
        setUser(null);
        navigate(getPublicEntryPathForConfig(config), { replace: true });
    };

    const completeOnboarding = async () => {
        if (!user?.email) return null;

        const authData = authRepository.getAuthData();
        const optimisticUser = { ...user, onboarding_completed: true };
        markOnboardingDone(user.email);
        if (authData?.token) {
            authRepository.saveAuthData({ token: authData.token, user: optimisticUser });
        }
        setUser(optimisticUser);

        try {
            const response = await httpClient.post('/api/auth/onboarding', { completed: true });
            const syncedUser = response?.user
                ? { ...response.user, onboarding_completed: true }
                : optimisticUser;
            markOnboardingDone(syncedUser.email || user.email);
            if (authData?.token) {
                authRepository.saveAuthData({ token: authData.token, user: syncedUser });
            }
            setUser(syncedUser);
            return syncedUser;
        } catch (err) {
            console.warn('No se pudo sincronizar onboarding con el servidor:', err);
            return optimisticUser;
        }
    };

    const role = user?.role ?? 'viewer';
    const isPremium = role === 'premium' || role === 'admin';
    const isAdmin = role === 'admin';

    const value = {
        user,
        loading,
        loadingStage,
        login,
        loginAsGuest,
        logout,
        isAuthenticated: !!user,
        role,
        isPremium,
        isAdmin,
        canCustomizeImages: isPremium,
        onboardingRequired,
        completeOnboarding,
        shouldShowOnboarding,
    };

    return (
        <AuthContext.Provider value={value}>
            <PresenceTracker />
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
