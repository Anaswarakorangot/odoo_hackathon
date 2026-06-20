export interface PurchaseOrderLine {
  id: string;
  product_id: string;
  product_name: string;
  ordered_qty: number;
  received_qty: number;
  cost_price: number;
  line_total: number;
}

export interface VendorBrief {
  id: string;
  name: string;
  address?: string;
}

export interface UserBrief {
  id: string;
  name: string;
}

export interface PurchaseOrder {
  id: string;
  reference: string;
  vendor: VendorBrief;
  vendor_address?: string;
  responsible_person?: UserBrief;
  status: 'draft' | 'confirmed' | 'partially_received' | 'fully_received' | 'cancelled';
  auto_created: boolean;
  source_sales_order_id?: string;
  source_sales_order_ref?: string;
  lines: PurchaseOrderLine[];
  total_amount: number;
  created_at: string;
  created_by?: UserBrief;
}

export interface PurchaseOrderListItem {
  id: string;
  reference: string;
  vendor_name: string;
  status: string;
  auto_created: boolean;
  total_amount: number;
  created_at: string;
}

export interface PurchaseOrderLineCreate {
  product_id: string;
  ordered_qty: number;
}

export interface PurchaseOrderCreateRequest {
  vendor_id: string;
  responsible_person_id?: string;
  line_items: PurchaseOrderLineCreate[];
}

export interface PurchaseOrderLineReceive {
  line_id: string;
  received_qty: number;
}

export interface PurchaseOrderReceiveRequest {
  lines: PurchaseOrderLineReceive[];
}

export interface Vendor {
  id: string;
  name: string;
}

export interface ProductBrief {
  id: string;
  name: string;
  cost_price: number;
  sales_price: number;
  on_hand_qty: number;
  free_to_use_qty?: number;
}

export const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-500/20 text-slate-300',
  confirmed: 'bg-blue-500/20 text-blue-300',
  partially_received: 'bg-amber-500/20 text-amber-300',
  fully_received: 'bg-emerald-500/20 text-emerald-300',
  cancelled: 'bg-red-500/20 text-red-300',
};

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  partially_received: 'Partially Received',
  fully_received: 'Fully Received',
  cancelled: 'Cancelled',
};
