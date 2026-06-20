export interface ProductBrief {
  id: string;
  name: string;
}

export interface UserBrief {
  id: string;
  name: string;
}

export interface BomLine {
  id: string;
  component_product_id: string;
  component_product_name: string;
  qty_per_unit: number;
}

export interface BomOperation {
  id: string;
  sequence: number;
  operation_name: string;
  work_center: string;
  expected_duration_min: number;
}

export interface Bom {
  id: string;
  reference: string;
  finished_product: ProductBrief;
  bom_lines: BomLine[];
  bom_operations: BomOperation[];
  created_at: string;
}

export interface BomListItem {
  id: string;
  reference: string;
  finished_product_id: string;
  finished_product_name: string;
  bom_lines_count: number;
  bom_operations_count: number;
  created_at: string;
}

export interface BomOption {
  id: string;
  reference: string;
}

export interface BomLineCreate {
  component_product_id: string;
  qty_per_unit: number;
}

export interface BomOperationCreate {
  sequence: number;
  operation_name: string;
  work_center: string;
  expected_duration_min: number;
}

export interface BomCreateRequest {
  finished_product_id: string;
  bom_lines: BomLineCreate[];
  bom_operations: BomOperationCreate[];
}

export interface BomUpdateRequest {
  finished_product_id?: string;
  bom_lines?: BomLineCreate[];
  bom_operations?: BomOperationCreate[];
}

export type MOStatus = 'draft' | 'confirmed' | 'in_progress' | 'done' | 'cancelled';

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
  status: MOStatus;
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
  status: MOStatus;
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

export interface MoComponentUpdate {
  component_id: string;
  consumed_qty: number;
  batch_number?: string;
}

export interface WorkOrderUpdate {
  work_order_id: string;
  real_duration_min?: number;
  pass_fail?: string;
}

export interface ManufacturingOrderUpdateRequest {
  finished_product_id?: string;
  assignee_id?: string;
  scheduled_date?: string;
  bom_id?: string;
  quantity?: number;
  components?: MoComponentUpdate[];
  work_orders?: WorkOrderUpdate[];
}

export const MO_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-500/20 text-slate-300',
  confirmed: 'bg-blue-500/20 text-blue-300',
  in_progress: 'bg-amber-500/20 text-amber-300',
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
