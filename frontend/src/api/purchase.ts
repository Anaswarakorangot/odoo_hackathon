import apiClient from './client';
import type {
  PurchaseOrder,
  PurchaseOrderListItem,
  PurchaseOrderCreateRequest,
  PurchaseOrderReceiveRequest,
  Vendor,
  ProductBrief,
} from '../types/purchase';

export const purchaseOrdersApi = {
  list: async (search?: string, status?: string): Promise<PurchaseOrderListItem[]> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    const response = await apiClient.get<PurchaseOrderListItem[]>(
      `/purchase-orders/${params.toString() ? '?' + params.toString() : ''}`,
    );
    return response.data;
  },

  get: async (id: string): Promise<PurchaseOrder> => {
    const response = await apiClient.get<PurchaseOrder>(`/purchase-orders/${id}`);
    return response.data;
  },

  create: async (data: PurchaseOrderCreateRequest): Promise<PurchaseOrder> => {
    const response = await apiClient.post<PurchaseOrder>('/purchase-orders/', data);
    return response.data;
  },

  update: async (id: string, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> => {
    const response = await apiClient.patch<PurchaseOrder>(`/purchase-orders/${id}`, data);
    return response.data;
  },

  confirm: async (id: string): Promise<PurchaseOrder> => {
    const response = await apiClient.post<PurchaseOrder>(`/purchase-orders/${id}/confirm`);
    return response.data;
  },

  receive: async (id: string, data: PurchaseOrderReceiveRequest): Promise<PurchaseOrder> => {
    const response = await apiClient.post<PurchaseOrder>(`/purchase-orders/${id}/receive`, data);
    return response.data;
  },

  cancel: async (id: string): Promise<PurchaseOrder> => {
    const response = await apiClient.post<PurchaseOrder>(`/purchase-orders/${id}/cancel`);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/purchase-orders/${id}`);
  },
};

export const vendorsApi = {
  list: async (search?: string): Promise<Vendor[]> => {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    const response = await apiClient.get<Vendor[]>(`/vendors/${params}`);
    return response.data;
  },
};

export const productsApi = {
  list: async (): Promise<ProductBrief[]> => {
    const response = await apiClient.get<ProductBrief[]>('/products/');
    return response.data;
  },
};

export const productsForPurchaseApi = {
  list: async (): Promise<{ id: string; name: string; cost_price: number; on_hand_qty: number }[]> => {
    const response = await apiClient.get('/products/');
    return response.data;
  },
};