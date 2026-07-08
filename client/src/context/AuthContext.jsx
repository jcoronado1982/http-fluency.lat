import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import config from '../config';
import { getPublicEntryPathForConfig, notifyAuthUserSynced, notifyAuthLogout } from '../modules';
import { authRepository } from '../repositories/AuthRepository';
import { httpClient } from '../services/httpClient';
import { usePresence } from '../hooks/usePresence';
import { shouldShowOnboarding, resolveOnboardingCompleted } from '../utils/onboardingStorage';

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

        setUser({
            ...authData.user,
            onboarding_completed: false,
            catalog_preferences: null,
        });
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
                    catalog_preferences: me.catalog_preferences ?? null,
                };
                notifyAuthUserSynced(config, nextUser);
                authRepository.saveAuthData({ token: authData.token, user: nextUser });
                setUser(nextUser);

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
                catalog_preferences: me.catalog_preferences ?? null,
            };
            notifyAuthUserSynced(config, syncedUser);
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
                const guestData = {
                    ...data,
                    user: { ...data.user, catalog_preferences: null },
                };
                notifyAuthUserSynced(config, guestData.user);
                authRepository.saveAuthData(guestData);
                setUser(guestData.user);
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
        notifyAuthLogout(config);
        setUser(null);
        navigate(getPublicEntryPathForConfig(config), { replace: true });
    };

    const completeOnboarding = async () => {
        if (!user?.email) return null;

        const authData = authRepository.getAuthData();

        for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
                await httpClient.post('/api/auth/onboarding', { completed: true });
                const me = await httpClient.get('/api/auth/me');
                const syncedUser = {
                    ...user,
                    role: me.effective_role || user.role,
                    onboarding_completed: me.onboarding_completed === true,
                    catalog_preferences: me.catalog_preferences ?? user.catalog_preferences ?? null,
                };

                if (syncedUser.onboarding_completed === true) {
                    if (authData?.token) {
                        authRepository.saveAuthData({ token: authData.token, user: syncedUser });
                    }
                    setUser(syncedUser);
                    return syncedUser;
                }

                throw new Error('El servidor no confirmó onboarding_completed=true');
            } catch (err) {
                if (attempt === 3) {
                    console.warn('No se pudo sincronizar onboarding con el servidor:', err);
                    return null;
                }
                await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
            }
        }
    };

    const updateCatalogPreferences = useCallback(async (catalogPreferences) => {
        if (!user?.email) return null;

        const authData = authRepository.getAuthData();
        const normalizedPreferences = catalogPreferences ?? null;
        const optimisticUser = { ...user, catalog_preferences: normalizedPreferences };
        notifyAuthUserSynced(config, optimisticUser);
        if (authData?.token) {
            authRepository.saveAuthData({ token: authData.token, user: optimisticUser });
        }
        setUser(optimisticUser);

        try {
            const response = await httpClient.post('/api/auth/catalog-preferences', {
                catalog_preferences: normalizedPreferences,
            });
            const syncedUser = response?.user
                ? { ...optimisticUser, ...response.user }
                : optimisticUser;
            notifyAuthUserSynced(config, { ...syncedUser, email: syncedUser.email || user.email });
            if (authData?.token) {
                authRepository.saveAuthData({ token: authData.token, user: syncedUser });
            }
            setUser(syncedUser);
            return syncedUser;
        } catch (err) {
            console.warn('No se pudo sincronizar catalog_preferences con el servidor:', err);
            return optimisticUser;
        }
    }, [user]);

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
        updateCatalogPreferences,
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
