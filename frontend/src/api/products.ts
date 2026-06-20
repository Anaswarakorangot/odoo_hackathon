import apiClient from './client';
import type {
  BomOption,
  Product,
  ProductCreateRequest,
  ProductStock,
  ProductUpdateRequest,
  VendorOption,
} from '../types/product';

export async function listProducts(): Promise<Product[]> {
  const r = await apiClient.get<Product[]>('/products');
  return r.data;
}

export async function getProduct(id: string): Promise<Product> {
  const r = await apiClient.get<Product>(`/products/${id}`);
  return r.data;
}

export async function getProductStock(id: string): Promise<ProductStock> {
  const r = await apiClient.get<ProductStock>(`/products/${id}/stock`);
  return r.data;
}

export async function createProduct(body: ProductCreateRequest): Promise<Product> {
  const r = await apiClient.post<Product>('/products', body);
  return r.data;
}

export async function updateProduct(
  id: string,
  body: ProductUpdateRequest,
): Promise<Product> {
  const r = await apiClient.patch<Product>(`/products/${id}`, body);
  return r.data;
}

export async function deleteProduct(id: string): Promise<void> {
  await apiClient.delete(`/products/${id}`);
}

export async function listVendors(): Promise<VendorOption[]> {
  const r = await apiClient.get<VendorOption[]>('/vendors');
  return r.data;
}

export async function listBoms(): Promise<BomOption[]> {
  const r = await apiClient.get<BomOption[]>('/boms');
  return r.data;
}
