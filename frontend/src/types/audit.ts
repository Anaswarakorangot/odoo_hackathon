export interface AuditLogItem {
  id: string;
  module: string;
  record_type: string;
  record_id: string;
  action: string;
  field_changed?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  occurred_at: string;
}

export interface AuditLogListResponse {
  items: AuditLogItem[];
  total_count: number;
}

export interface AuditLogFilters {
  module?: string;
  action?: string;
  user_name?: string;
  date_from?: string;
  date_to?: string;
  since?: string;
  page?: number;
  page_size?: number;
}

export const AUDIT_MODULES = ['Sales', 'Purchase', 'Manufacturing', 'Product', 'BoM'];
export const AUDIT_ACTIONS = ['created', 'updated', 'deleted', 'status_changed'];

export const ACTION_COLORS: Record<string, string> = {
  created: 'bg-emerald-500/20 text-emerald-300',
  updated: 'bg-cyan-500/20 text-cyan-300',
  deleted: 'bg-rose-500/20 text-rose-300',
  status_changed: 'bg-amber-500/20 text-amber-300',
};
