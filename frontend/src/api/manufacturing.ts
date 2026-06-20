import apiClient from './client';
import type {
  ManufacturingOrder,
  ManufacturingOrderListItem,
  ManufacturingOrderCreateRequest,
} from '../types/manufacturing';

export const manufacturingOrdersApi = {
  list: async (search?: string, status?: string): Promise<ManufacturingOrderListItem[]> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status) params.append('status_filter', status);
    const q = params.toString();
    const response = await apiClient.get<ManufacturingOrderListItem[]>(`/manufacturing-orders/${q ? '?' + q : ''}`);
    return response.data;
  },

  get: async (id: string): Promise<ManufacturingOrder> => {
    const response = await apiClient.get<ManufacturingOrder>(`/manufacturing-orders/${id}`);
    return response.data;
  },

  create: async (data: ManufacturingOrderCreateRequest): Promise<ManufacturingOrder> => {
    const response = await apiClient.post<ManufacturingOrder>('/manufacturing-orders/', data);
    return response.data;
  },

  update: async (id: string, data: object): Promise<ManufacturingOrder> => {
    const response = await apiClient.patch<ManufacturingOrder>(`/manufacturing-orders/${id}`, data);
    return response.data;
  },

  confirm: async (id: string): Promise<ManufacturingOrder> => {
    const response = await apiClient.post<ManufacturingOrder>(`/manufacturing-orders/${id}/confirm`);
    return response.data;
  },

  start: async (id: string): Promise<ManufacturingOrder> => {
    const response = await apiClient.post<ManufacturingOrder>(`/manufacturing-orders/${id}/start`);
    return response.data;
  },

  produce: async (id: string): Promise<ManufacturingOrder> => {
    const response = await apiClient.post<ManufacturingOrder>(`/manufacturing-orders/${id}/produce`);
    return response.data;
  },

  cancel: async (id: string): Promise<ManufacturingOrder> => {
    const response = await apiClient.post<ManufacturingOrder>(`/manufacturing-orders/${id}/cancel`);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/manufacturing-orders/${id}`);
  },
};

export const productsForMoApi = {
  list: async (): Promise<{ id: string; name: string; product_type: string }[]> => {
    const response = await apiClient.get('/products/');
    return response.data;
  },
};

export const bomsApi = {
  list: async (): Promise<{ id: string; reference: string; finished_product_id: string; finished_product_name: string }[]> => {
    const response = await apiClient.get('/boms/list');
    return response.data;
  },
};
