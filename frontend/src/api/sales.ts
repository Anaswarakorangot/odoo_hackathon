import apiClient from './client';
import type {
  SalesOrder,
  SalesOrderListItem,
  SalesOrderCreateRequest,
  SalesOrderDeliverRequest,
  Customer,
  ProductBrief,
} from '../types/sales';

// Sales Orders API
export const salesOrdersApi = {
  list: async (search?: string, status?: string): Promise<SalesOrderListItem[]> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    const response = await apiClient.get<SalesOrderListItem[]>(
      `/sales-orders/${params.toString() ? '?' + params.toString() : ''}`
    );
    return response.data;
  },

  get: async (id: string): Promise<SalesOrder> => {
    const response = await apiClient.get<SalesOrder>(`/sales-orders/${id}`);
    return response.data;
  },

  create: async (data: SalesOrderCreateRequest): Promise<SalesOrder> => {
    const response = await apiClient.post<SalesOrder>('/sales-orders/', data);
    return response.data;
  },

  update: async (id: string, data: Partial<SalesOrder>): Promise<SalesOrder> => {
    const response = await apiClient.patch<SalesOrder>(`/sales-orders/${id}`, data);
    return response.data;
  },

  confirm: async (id: string): Promise<SalesOrder> => {
    const response = await apiClient.post<SalesOrder>(`/sales-orders/${id}/confirm`);
    return response.data;
  },

  deliver: async (id: string, data: SalesOrderDeliverRequest): Promise<SalesOrder> => {
    const response = await apiClient.post<SalesOrder>(`/sales-orders/${id}/deliver`, data);
    return response.data;
  },

  cancel: async (id: string): Promise<SalesOrder> => {
    const response = await apiClient.post<SalesOrder>(`/sales-orders/${id}/cancel`);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/sales-orders/${id}`);
  },
};

// Customers API
export const customersApi = {
  list: async (search?: string): Promise<Customer[]> => {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    const response = await apiClient.get<Customer[]>(`/customers/${params}`);
    return response.data;
  },

  get: async (id: string): Promise<Customer> => {
    const response = await apiClient.get<Customer>(`/customers/${id}`);
    return response.data;
  },

  create: async (data: { name: string; address?: string }): Promise<Customer> => {
    const response = await apiClient.post<Customer>('/customers/', data);
    return response.data;
  },
};

// Products API (for dropdowns)
export const productsApi = {
  list: async (): Promise<ProductBrief[]> => {
    const response = await apiClient.get<ProductBrief[]>('/products/');
    return response.data;
  },

  getStock: async (id: string): Promise<{ on_hand_qty: number; reserved_qty: number; free_to_use_qty: number }> => {
    const response = await apiClient.get(`/products/${id}/stock`);
    return response.data;
  },
};
