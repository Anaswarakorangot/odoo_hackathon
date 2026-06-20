export interface SalesOrderLine {
  id: string;
  product_id: string;
  product_name: string;
  ordered_qty: number;
  delivered_qty: number;
  sales_price: number;
  line_total: number;
}

export interface CustomerBrief {
  id: string;
  name: string;
  address?: string;
}

export interface UserBrief {
  id: string;
  name: string;
}

export interface SalesOrder {
  id: string;
  reference: string;
  customer: CustomerBrief;
  customer_address?: string;
  salesperson?: UserBrief;
  status: 'draft' | 'confirmed' | 'partially_delivered' | 'fully_delivered' | 'cancelled';
  lines: SalesOrderLine[];
  total_amount: number;
  created_at: string;
  created_by?: UserBrief;
}

export interface SalesOrderListItem {
  id: string;
  reference: string;
  customer_name: string;
  status: string;
  total_amount: number;
  created_at: string;
}

export interface SalesOrderLineCreate {
  product_id: string;
  ordered_qty: number;
}

export interface SalesOrderCreateRequest {
  customer_id: string;
  salesperson_id?: string;
  line_items: SalesOrderLineCreate[];
}

export interface SalesOrderLineDeliver {
  line_id: string;
  delivered_qty: number;
}

export interface SalesOrderDeliverRequest {
  lines: SalesOrderLineDeliver[];
}

export interface Customer {
  id: string;
  name: string;
  address?: string;
  created_at: string;
}

export interface ProductBrief {
  id: string;
  name: string;
  sales_price: number;
  on_hand_qty: number;
  free_to_use_qty?: number;
}

export const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-500/20 text-slate-300',
  confirmed: 'bg-blue-500/20 text-blue-300',
  partially_delivered: 'bg-amber-500/20 text-amber-300',
  fully_delivered: 'bg-emerald-500/20 text-emerald-300',
  cancelled: 'bg-red-500/20 text-red-300',
};

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  partially_delivered: 'Partially Delivered',
  fully_delivered: 'Fully Delivered',
  cancelled: 'Cancelled',
};
