import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import config from '../config';
import { getPublicEntryPathForConfig } from '../modules';
import { authRepository } from '../repositories/AuthRepository';
import { httpClient } from '../services/httpClient';
import { usePresence } from '../hooks/usePresence';
import { shouldShowOnboarding } from '../utils/onboardingStorage';

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

        // Sincronizar rol con el servidor (localStorage puede decir "admin" con JWT viejo "viewer").
        httpClient.get('/api/auth/me')
            .then((me) => {
                const nextUser = {
                    ...authData.user,
                    role: me.effective_role || authData.user.role,
                    onboarding_completed: me.onboarding_completed === true,
                };
                const roleChanged = nextUser.role !== authData.user.role;
                const onboardingChanged = nextUser.onboarding_completed !== authData.user.onboarding_completed;
                if (roleChanged || onboardingChanged) {
                    const updatedUser = nextUser;
                    authRepository.saveAuthData({ ...authData, user: updatedUser });
                    setUser(updatedUser);
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
        if (data.success) {
            authRepository.saveAuthData(data);
            setUser(data.user);
        }
        return data;
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
        } catch (err) {
            console.error('Dev guest login failed:', err);
        }
    };

    const logout = () => {
        httpClient.post('/api/presence/leave', {}).catch(() => {});
        authRepository.logout();
        setUser(null);
        navigate(getPublicEntryPathForConfig(config), { replace: true });
    };

    const completeOnboarding = async () => {
        if (!user?.email) return;
        const response = await httpClient.post('/api/auth/onboarding', { completed: true });
        if (!response?.user) return;
        const authData = authRepository.getAuthData();
        if (authData?.token) {
            authRepository.saveAuthData({ token: authData.token, user: response.user });
        }
        setUser(response.user);
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
