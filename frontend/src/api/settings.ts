import apiClient from './client';

export interface UserSettings {
  default_landing_module: string | null;
  default_list_view: 'table' | 'kanban';
  rows_per_page: number;
  theme: 'system' | 'light' | 'dark';
  notification_prefs: Record<string, boolean>;
}

export interface UserSettingsResponse extends UserSettings {
  available_landing_modules: string[];
  available_notification_keys: string[];
}

export const settingsApi = {
  get: async (): Promise<UserSettingsResponse> => {
    const response = await apiClient.get<UserSettingsResponse>('/users/me/settings');
    return response.data;
  },

  update: async (data: Partial<UserSettings>): Promise<UserSettingsResponse> => {
    const response = await apiClient.put<UserSettingsResponse>('/users/me/settings', data);
    return response.data;
  },
};
