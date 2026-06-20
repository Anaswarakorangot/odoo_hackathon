import apiClient from './client';
import type { User, RoleType } from '../types/auth';

export const usersApi = {
  list: async (): Promise<User[]> => {
    const response = await apiClient.get<User[]>('/users/');
    return response.data;
  },

  update: async (id: string, data: { role: RoleType | null }): Promise<User> => {
    const response = await apiClient.patch<User>(`/users/${id}`, data);
    return response.data;
  },
};
