/**
 * Unified HTTP client.
 *
 * Single point that:
 *  - Reads the JWT from localStorage (set by AuthRepository on login).
 *  - Attaches `Authorization: Bearer <token>` to every request automatically.
 *  - Throws on non-2xx responses with a descriptive message.
 *
 * Usage:
 *   import { httpClient } from '../services/httpClient';
 *   const data = await httpClient.get('/api/categories');
 *   const data = await httpClient.post('/api/update-status', { user_id, … });
 */

import { API_URL } from '../config/api';

function getToken() {
    return localStorage.getItem('auth_token');
}

function buildHeaders(extra = {}) {
    const headers = { 'Content-Type': 'application/json', ...extra };
    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

async function request(method, path, body) {
    const url = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? path : '/' + path}`;
    const options = {
        method,
        headers: buildHeaders(),
    };
    if (body !== undefined) {
        options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return res.json();
}

export const httpClient = {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    delete: (path, body) => request('DELETE', path, body),
};
