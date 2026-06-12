import axios from 'axios';
import { API_URL } from '../config/api';

class AuthRepository {
    async loginWithGoogle(idToken) {
        try {
            const response = await axios.post(`${API_URL}/api/auth/google`, {
                id_token: idToken
            });
            return response.data;
        } catch (error) {
            console.error('Error logging in with Google:', error);
            throw error;
        }
    }

    saveAuthData(data) {
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));
    }

    getAuthData() {
        const token = localStorage.getItem('auth_token');
        const userStr = localStorage.getItem('auth_user');
        if (token && userStr) {
            return { token, user: JSON.parse(userStr) };
        }
        return null;
    }

    logout() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
    }
}

export const authRepository = new AuthRepository();
