import apiClient from './client';
import type { AuditLogListResponse, AuditLogFilters } from '../types/audit';

export const auditLogsApi = {
  list: async (filters: AuditLogFilters = {}): Promise<AuditLogListResponse> => {
    const params = new URLSearchParams();
    if (filters.module) params.append('module', filters.module);
    if (filters.action) params.append('action', filters.action);
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);
    if (filters.since) params.append('since', filters.since);
    if (filters.page) params.append('page', String(filters.page));
    if (filters.page_size) params.append('page_size', String(filters.page_size));

    const qs = params.toString();
    const response = await apiClient.get<AuditLogListResponse>(
      `/audit-logs/${qs ? '?' + qs : ''}`
    );
    return response.data;
  },
};
