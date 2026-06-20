export type ProductType = 'finished_good' | 'sub_assembly' | 'raw_component';
export type ProcurementType = 'purchase' | 'manufacturing';

export interface Product {
  id: string;
  name: string;
  product_type: ProductType;
  sales_price: string;
  cost_price: string;
  on_hand_qty: string;
  reserved_qty: string;
  free_to_use_qty: string;
  procure_on_demand: boolean;
  procurement_type: ProcurementType | null;
  vendor_id: string | null;
  default_bom_id: string | null;
}

export interface ProductStock {
  on_hand_qty: string;
  reserved_qty: string;
  free_to_use_qty: string;
}

export interface ProductCreateRequest {
  name: string;
  product_type?: ProductType;
  sales_price: number;
  cost_price: number;
  procure_on_demand: boolean;
  procurement_type?: ProcurementType | null;
  vendor_id?: string | null;
  default_bom_id?: string | null;
}

export interface ProductUpdateRequest {
  product_type?: ProductType;
  sales_price?: number;
  cost_price?: number;
  procure_on_demand?: boolean;
  procurement_type?: ProcurementType | null;
  vendor_id?: string | null;
  default_bom_id?: string | null;
}

export interface VendorOption {
  id: string;
  name: string;
}

export interface BomOption {
  id: string;
  reference: string;
}

export interface FieldError {
  field: string;
  message: string;
}
