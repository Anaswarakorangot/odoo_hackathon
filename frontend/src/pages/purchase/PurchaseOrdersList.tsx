import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { purchaseOrdersApi } from '../../api/purchase';
import type { PurchaseOrderListItem } from '../../types/purchase';
import { PO_STATUS_COLORS, PO_STATUS_LABELS } from '../../types/purchase';

type ViewMode = 'table' | 'kanban';
const PO_STATUSES = ['draft', 'confirmed', 'partially_received', 'fully_received', 'cancelled'] as const;

export default function PurchaseOrdersList() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PurchaseOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  useEffect(() => { loadOrders(); }, [search, statusFilter]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      setOrders(await purchaseOrdersApi.list(search || undefined, statusFilter || undefined));
      setError('');
    } catch {
      setError('Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (event: React.MouseEvent, id: string) => {
    event.stopPropagation();
    if (!confirm('Cancel this purchase order?')) return;
    try {
      await purchaseOrdersApi.cancel(id);
      loadOrders();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to cancel order');
    }
  };

  const handleDelete = async (event: React.MouseEvent, id: string, reference: string) => {
    event.stopPropagation();
    if (!confirm(`Delete ${reference}? This cannot be undone.`)) return;
    try {
      await purchaseOrdersApi.delete(id);
      loadOrders();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete order');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const diffMs = Date.now() - date.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);
    if (diffH < 1) return 'Just now';
    if (diffH < 24) return `${diffH}h ago`;
    if (diffD === 1) return 'Yesterday';
    if (diffD < 7) return `${diffD} days ago`;
    return date.toLocaleDateString();
  };

  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const ordersByStatus = Object.fromEntries(PO_STATUSES.map((status) => [status, orders.filter((order) => order.status === status)])) as Record<string, PurchaseOrderListItem[]>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Purchase Orders</h1>
          <p className="mt-1 text-sm text-slate-400">Manage vendor orders and receipts</p>
        </div>
        <button onClick={() => navigate('/purchase/new')} className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 font-medium text-white transition-all shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-400">
          + New Purchase Order
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-[200px] flex-1">
          <input type="text" placeholder="Search by reference or vendor..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50">
          <option value="">All Statuses</option>
          {PO_STATUSES.map((status) => <option key={status} value={status}>{PO_STATUS_LABELS[status]}</option>)}
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
      {loading && <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" /></div>}

      {!loading && viewMode === 'table' && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="px-6 py-4 text-left text-sm font-medium text-slate-400">Reference</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-slate-400">Vendor</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-slate-400">Status</th>
                <th className="px-6 py-4 text-right text-sm font-medium text-slate-400">Total</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-slate-400">Created</th>
                <th className="px-6 py-4 text-right text-sm font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} onClick={() => navigate(`/purchase/${order.id}`)} className="cursor-pointer border-b border-slate-800/50 transition-colors hover:bg-slate-800/30">
                  <td className="px-6 py-4 text-slate-200">{order.reference}</td>
                  <td className="px-6 py-4 text-slate-300">{order.vendor_name}</td>
                  <td className="px-6 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${PO_STATUS_COLORS[order.status]}`}>{PO_STATUS_LABELS[order.status]}</span></td>
                  <td className="px-6 py-4 text-right text-slate-300">{formatCurrency(order.total_amount)}</td>
                  <td className="px-6 py-4 text-slate-400">{formatDate(order.created_at)}</td>
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
          {PO_STATUSES.map((status) => (
            <div key={status} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">{PO_STATUS_LABELS[status]}</h3>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{ordersByStatus[status].length}</span>
              </div>
              <div className="space-y-3">
                {ordersByStatus[status].map((order) => (
                  <button key={order.id} onClick={() => navigate(`/purchase/${order.id}`)} className="w-full rounded-xl border border-slate-800 bg-slate-950 p-4 text-left transition-colors hover:border-cyan-500/30 hover:bg-slate-900">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">{order.reference}</div>
                        <div className="mt-1 text-sm text-slate-400">{order.vendor_name}</div>
                      </div>
                      <span className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-300">{formatCurrency(order.total_amount)}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>{formatDate(order.created_at)}</span>
                      <span className={`rounded-full px-2 py-1 ${PO_STATUS_COLORS[order.status]}`}>{PO_STATUS_LABELS[order.status]}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && orders.length === 0 && <div className="rounded-xl border border-slate-800 bg-slate-900 px-6 py-10 text-center text-slate-400">No purchase orders found.</div>}
    </div>
  );
}