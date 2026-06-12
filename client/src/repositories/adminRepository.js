import { httpClient } from '../services/httpClient';

export const adminRepository = {
    async getUsersActivity(page = 1, limit = 25) {
        return httpClient.get(`/api/admin/users/activity?page=${page}&limit=${limit}`);
    },
};
