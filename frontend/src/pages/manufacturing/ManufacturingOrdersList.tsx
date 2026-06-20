import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { manufacturingOrdersApi } from '../../api/manufacturing';
import type { ManufacturingOrderListItem } from '../../types/manufacturing';
import { MO_STATUS_COLORS, MO_STATUS_LABELS } from '../../types/manufacturing';

type ViewMode = 'table' | 'kanban';
const MO_STATUSES = ['draft', 'confirmed', 'in_progress', 'done', 'cancelled'] as const;

export default function ManufacturingOrdersList() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<ManufacturingOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  useEffect(() => {
    loadOrders();
    
    const handleSystemEvent = () => loadOrders();
    window.addEventListener('systemDataChanged', handleSystemEvent);
    
    return () => {
      window.removeEventListener('systemDataChanged', handleSystemEvent);
    };
  }, [search, statusFilter]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      setOrders(await manufacturingOrdersApi.list(search || undefined, statusFilter || undefined));
      setError('');
    } catch {
      setError('Failed to load manufacturing orders');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (event: React.MouseEvent, id: string) => {
    event.stopPropagation();
    if (!confirm('Cancel this manufacturing order?')) return;
    try {
      await manufacturingOrdersApi.cancel(id);
      loadOrders();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to cancel order');
    }
  };

  const handleDelete = async (event: React.MouseEvent, id: string, reference: string) => {
    event.stopPropagation();
    if (!confirm(`Delete ${reference}? This cannot be undone.`)) return;
    try {
      await manufacturingOrdersApi.delete(id);
      loadOrders();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete order');
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'No date';
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays > 1 && diffDays < 7) return `In ${diffDays} days`;
    if (diffDays < -1 && diffDays > -7) return `${Math.abs(diffDays)} days ago`;
    return date.toLocaleDateString();
  };

  const ordersByStatus = Object.fromEntries(MO_STATUSES.map((status) => [status, orders.filter((order) => order.status === status)])) as Record<string, ManufacturingOrderListItem[]>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Manufacturing Orders</h1>
          <p className="mt-1 text-sm text-slate-400">Manage production orders and work orders</p>
        </div>
        <button onClick={() => navigate('/manufacturing/new')} className="rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-4 py-2 font-medium text-white transition-all shadow-lg shadow-violet-500/20 hover:from-violet-400 hover:to-purple-400">
          + New MO
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-[200px] flex-1">
          <input type="text" placeholder="Search by reference or product..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50">
          <option value="">All Statuses</option>
          {MO_STATUSES.map((status) => <option key={status} value={status}>{MO_STATUS_LABELS[status]}</option>)}
        </select>
        <div className="flex rounded-xl bg-slate-800 p-1">
          {(['table', 'kanban'] as const).map((mode) => (
            <button key={mode} onClick={() => setViewMode(mode)} className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${viewMode === mode ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
              {mode}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">{error}</div>}
      {loading && <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" /></div>}

      {!loading && viewMode === 'table' && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="px-6 py-4 text-left text-sm font-medium text-slate-400">Reference</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-slate-400">Product</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-slate-400">Qty</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-slate-400">VIN</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-slate-400">Status</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-slate-400">Scheduled</th>
                <th className="px-6 py-4 text-right text-sm font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} onClick={() => navigate(`/manufacturing/${order.id}`)} className="cursor-pointer border-b border-slate-800/50 transition-colors hover:bg-slate-800/30">
                  <td className="px-6 py-4 text-slate-200">{order.reference}</td>
                  <td className="px-6 py-4 text-slate-300">{order.finished_product_name}</td>
                  <td className="px-6 py-4 text-slate-300">{order.quantity}</td>
                  <td className="px-6 py-4 font-mono text-xs text-cyan-300">{order.vin_number || <span className="text-slate-600">—</span>}</td>
                  <td className="px-6 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${MO_STATUS_COLORS[order.status]}`}>{MO_STATUS_LABELS[order.status]}</span></td>
                  <td className="px-6 py-4 text-slate-400">{formatDate(order.scheduled_date)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={(event) => handleCancel(event, order.id)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white">Cancel</button>
                      <button onClick={(event) => handleDelete(event, order.id, order.reference)} className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && viewMode === 'kanban' && (
        <div className="grid gap-4 xl:grid-cols-5 lg:grid-cols-3 sm:grid-cols-2">
          {MO_STATUSES.map((status) => (
            <div key={status} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">{MO_STATUS_LABELS[status]}</h3>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{ordersByStatus[status].length}</span>
              </div>
              <div className="space-y-3">
                {ordersByStatus[status].map((order) => (
                  <button key={order.id} onClick={() => navigate(`/manufacturing/${order.id}`)} className="w-full rounded-xl border border-slate-800 bg-slate-950 p-4 text-left transition-colors hover:border-violet-500/30 hover:bg-slate-900">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">{order.reference}</div>
                        <div className="mt-1 text-sm text-slate-400">{order.finished_product_name}</div>
                      </div>
                      <span className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-300">{order.quantity}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>{formatDate(order.scheduled_date)}</span>
                      <span className={`rounded-full px-2 py-1 ${MO_STATUS_COLORS[order.status]}`}>{MO_STATUS_LABELS[order.status]}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && orders.length === 0 && <div className="rounded-xl border border-slate-800 bg-slate-900 px-6 py-10 text-center text-slate-400">No manufacturing orders found.</div>}
    </div>
  );
}