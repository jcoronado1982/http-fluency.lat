import React, { createContext, useContext, useState, useEffect } from 'react';
import { authRepository } from '../repositories/AuthRepository';
import { httpClient } from '../services/httpClient';
import { usePresence } from '../hooks/usePresence';

const AuthContext = createContext();

function PresenceTracker() {
    usePresence();
    return null;
}

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const authData = authRepository.getAuthData();
        if (!authData) {
            setLoading(false);
            return;
        }

        setUser(authData.user);

        // Sincronizar rol con el servidor (localStorage puede decir "admin" con JWT viejo "viewer").
        httpClient.get('/api/auth/me')
            .then((me) => {
                if (me.effective_role && me.effective_role !== authData.user.role) {
                    const updatedUser = { ...authData.user, role: me.effective_role };
                    authRepository.saveAuthData({ ...authData, user: updatedUser });
                    setUser(updatedUser);
                }
            })
            .catch((err) => console.warn('No se pudo sincronizar rol desde /api/auth/me:', err))
            .finally(() => setLoading(false));
    }, []);

    const login = async (idToken) => {
        const data = await authRepository.loginWithGoogle(idToken);
        if (data.success) {
            authRepository.saveAuthData(data);
            setUser(data.user);
        }
        return data;
    };

    const loginAsGuest = () => {
        if (!import.meta.env.DEV) {
            console.warn('Guest login is only available in development mode.');
            return;
        }
        const guestData = {
            success: true,
            token: "guest-token-123",
            user: {
                id: "guest",
                email: "guest@local.dev",
                name: "Invitado Local",
                picture: "",
                role: "admin"
            }
        };
        authRepository.saveAuthData(guestData);
        setUser(guestData.user);
    };

    const logout = () => {
        httpClient.post('/api/presence/leave', {}).catch(() => {});
        authRepository.logout();
        setUser(null);
    };

    const role = user?.role ?? 'viewer';
    const isPremium = role === 'premium' || role === 'admin';
    const isAdmin = role === 'admin';

    const value = {
        user,
        loading,
        login,
        loginAsGuest,
        logout,
        isAuthenticated: !!user,
        role,
        isPremium,
        isAdmin,
        canCustomizeImages: isPremium,
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
