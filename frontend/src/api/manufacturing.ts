import apiClient from './client';
import type {
  Bom,
  BomListItem,
  BomOption,
  BomCreateRequest,
  BomUpdateRequest,
  ManufacturingOrder,
  ManufacturingOrderListItem,
  ManufacturingOrderCreateRequest,
  ManufacturingOrderUpdateRequest,
} from '../types/manufacturing';

// -----------------------------
// Manufacturing Orders
// -----------------------------

export const manufacturingOrdersApi = {
  list: async (search?: string, statusFilter?: string): Promise<ManufacturingOrderListItem[]> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (statusFilter) params.append('status_filter', statusFilter);
    const response = await apiClient.get<ManufacturingOrderListItem[]>(
      `/manufacturing-orders/${params.toString() ? '?' + params.toString() : ''}`
    );
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

  update: async (id: string, data: ManufacturingOrderUpdateRequest): Promise<ManufacturingOrder> => {
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

// -----------------------------
// BoMs
// -----------------------------

export const bomsApi = {
  // GET /boms - brief list for dropdowns
  listBrief: async (): Promise<BomOption[]> => {
    const response = await apiClient.get<BomOption[]>('/boms');
    return response.data;
  },

  // GET /boms/list - detailed list for the BoM list page
  list: async (productId?: string): Promise<BomListItem[]> => {
    const params = productId ? `?product_id=${productId}` : '';
    const response = await apiClient.get<BomListItem[]>(`/boms/list${params}`);
    return response.data;
  },

  get: async (id: string): Promise<Bom> => {
    const response = await apiClient.get<Bom>(`/boms/${id}`);
    return response.data;
  },

  create: async (data: BomCreateRequest): Promise<Bom> => {
    const response = await apiClient.post<Bom>('/boms/', data);
    return response.data;
  },

  update: async (id: string, data: BomUpdateRequest): Promise<Bom> => {
    const response = await apiClient.patch<Bom>(`/boms/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/boms/${id}`);
  },
};
