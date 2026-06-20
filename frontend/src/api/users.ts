import apiClient from './client';
import type { User } from '../types/auth';

export interface PermissionEntry {
  module: string;
  action: string;
  allowed: boolean;
  source: 'role' | 'override' | 'admin';
}

export interface UserPermissionsResponse {
  user_id: string;
  role: string | null;
  is_system_admin: boolean;
  permissions: PermissionEntry[];
}

export interface PermissionUpdate {
  module: string;
  action: string;
  allowed: boolean | null; // null = clear override
}

export const usersApi = {
  list: async (): Promise<User[]> => {
    const response = await apiClient.get<User[]>('/users/');
    return response.data;
  },

  update: async (id: string, data: Partial<User>): Promise<User> => {
    const response = await apiClient.patch<User>(`/users/${id}`, data);
    return response.data;
  },

  getPermissions: async (id: string): Promise<UserPermissionsResponse> => {
    const response = await apiClient.get<UserPermissionsResponse>(`/users/${id}/permissions`);
    return response.data;
  },

  updatePermissions: async (
    id: string,
    updates: PermissionUpdate[],
  ): Promise<UserPermissionsResponse> => {
    const response = await apiClient.put<UserPermissionsResponse>(
      `/users/${id}/permissions`,
      { updates },
    );
    return response.data;
  },
};
