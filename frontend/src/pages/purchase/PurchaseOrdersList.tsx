import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { purchaseOrdersApi } from '../../api/purchase';
import type { PurchaseOrderListItem } from '../../types/purchase';
import { PO_STATUS_COLORS, PO_STATUS_LABELS } from '../../types/purchase';
import { useAuth } from '../../contexts/AuthContext';

type ViewMode = 'table' | 'kanban';

const PO_STATUSES = ['draft', 'confirmed', 'partially_received', 'fully_received', 'cancelled'] as const;

export default function PurchaseOrdersList() {
  const navigate = useNavigate();
  const { isSystemAdmin } = useAuth();
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
      const data = await purchaseOrdersApi.list(search || undefined, statusFilter || undefined);
      setOrders(data);
      setError('');
    } catch {
      setError('Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Cancel this purchase order?')) return;
    try {
      await purchaseOrdersApi.cancel(id);
      loadOrders();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to cancel order');
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string, ref: string) => {
    e.stopPropagation();
    if (!confirm(`Delete ${ref}? This cannot be undone.`)) return;
    try {
      await purchaseOrdersApi.delete(id);
      loadOrders();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete order');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);
    if (diffH < 1) return 'Just now';
    if (diffH < 24) return `${diffH}h ago`;
    if (diffD === 1) return 'Yesterday';
    if (diffD < 7) return `${diffD} days ago`;
    return date.toLocaleDateString();
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const ordersByStatus = Object.fromEntries(
    PO_STATUSES.map((s) => [s, orders.filter((o) => o.status === s)])
  ) as Record<string, PurchaseOrderListItem[]>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Purchase Orders</h1>
          <p className="text-slate-400 text-sm mt-1">Manage vendor orders and receipts</p>
        </div>
        <button
          onClick={() => navigate('/purchase/new')}
          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium hover:from-cyan-400 hover:to-blue-400 transition-all shadow-lg shadow-cyan-500/20"
        >
          + New Purchase Order
        </button>
      </div>

      {/* Filters + View toggle */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search by reference or vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
        >
          <option value="">All Statuses</option>
          {PO_STATUSES.map((s) => (
            <option key={s} value={s}>{PO_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <div className="flex bg-slate-800 rounded-xl p-1">
          {(['table', 'kanban'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                viewMode === m ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">{error}</div>}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Table View */}
      {!loading && viewMode === 'table' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Reference</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Vendor</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Status</th>
                <th className="text-right px-6 py-4 text-sm font-medium text-slate-400">Total</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Date</th>
                <th className="text-right px-6 py-4 text-sm font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">No purchase orders found</td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer"
                    onClick={() => navigate(`/purchase/${order.id}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{order.reference}</span>
                        {order.auto_created && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-purple-500/20 text-purple-300">Auto</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-300">{order.vendor_name}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${PO_STATUS_COLORS[order.status]}`}>
                        {PO_STATUS_LABELS[order.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-white">{formatCurrency(order.total_amount)}</td>
                    <td className="px-6 py-4 text-slate-400 text-sm">{formatDate(order.created_at)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {isSystemAdmin && order.status === 'draft' && (
                          <button
                            onClick={(e) => handleDelete(e, order.id, order.reference)}
                            className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded"
                          >
                            Delete
                          </button>
                        )}
                        {!['fully_received', 'cancelled'].includes(order.status) && (
                          <button
                            onClick={(e) => handleCancel(e, order.id)}
                            className="px-2 py-1 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Kanban View */}
      {!loading && viewMode === 'kanban' && (
        <div className="grid grid-cols-5 gap-4 overflow-x-auto pb-4">
          {PO_STATUSES.map((status) => (
            <div key={status} className="min-w-[220px]">
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${PO_STATUS_COLORS[status]}`}>
                  {PO_STATUS_LABELS[status]}
                </span>
                <span className="text-slate-500 text-sm">({ordersByStatus[status].length})</span>
              </div>
              <div className="space-y-3">
                {ordersByStatus[status].map((order) => (
                  <div
                    key={order.id}
                    onClick={() => navigate(`/purchase/${order.id}`)}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-medium text-white text-sm">{order.reference}</span>
                      {order.auto_created && (
                        <span className="px-1 py-0.5 rounded text-xs bg-purple-500/20 text-purple-300">Auto</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mb-2">{order.vendor_name}</div>
                    <div className="flex justify-between items-center">
                      <span className="text-cyan-400 font-medium text-sm">{formatCurrency(order.total_amount)}</span>
                      <span className="text-xs text-slate-500">{formatDate(order.created_at)}</span>
                    </div>
                  </div>
                ))}
                {ordersByStatus[status].length === 0 && (
                  <div className="text-center py-8 text-slate-600 text-sm">No orders</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
