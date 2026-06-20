export interface ProductBrief {
  id: string;
  name: string;
}

export interface UserBrief {
  id: string;
  name: string;
}

export interface MoComponent {
  id: string;
  component_product_id: string;
  component_product_name: string;
  to_consume: number;
  consumed_qty: number;
  batch_number?: string;
  free_to_use_qty?: number;
}

export interface WorkOrder {
  id: string;
  sequence: number;
  operation_name: string;
  work_center: string;
  expected_duration_min: number;
  real_duration_min?: number;
  pass_fail?: string;
}

export interface ManufacturingOrder {
  id: string;
  reference: string;
  finished_product: ProductBrief;
  bom_id?: string;
  quantity: number;
  status: 'draft' | 'confirmed' | 'in_progress' | 'done' | 'cancelled';
  auto_created: boolean;
  source_sales_order_id?: string;
  source_sales_order_ref?: string;
  assignee?: UserBrief;
  scheduled_date?: string;
  components: MoComponent[];
  work_orders: WorkOrder[];
  created_at: string;
  created_by?: UserBrief;
}

export interface ManufacturingOrderListItem {
  id: string;
  reference: string;
  finished_product_id: string;
  finished_product_name: string;
  quantity: number;
  status: string;
  auto_created: boolean;
  source_sales_order_id?: string;
  created_at: string;
}

export interface ManufacturingOrderCreateRequest {
  finished_product_id: string;
  quantity: number;
  bom_id?: string;
  assignee_id?: string;
  scheduled_date?: string;
}

export const MO_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-500/20 text-slate-300',
  confirmed: 'bg-blue-500/20 text-blue-300',
  in_progress: 'bg-violet-500/20 text-violet-300',
  done: 'bg-emerald-500/20 text-emerald-300',
  cancelled: 'bg-red-500/20 text-red-300',
};

export const MO_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  done: 'Done',
  cancelled: 'Cancelled',
};
