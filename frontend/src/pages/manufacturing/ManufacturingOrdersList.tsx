import { useState, useEffect } from 'react';
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

  useEffect(() => { loadOrders(); }, [search, statusFilter]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await manufacturingOrdersApi.list(search || undefined, statusFilter || undefined);
      setOrders(data);
      setError('');
    } catch {
      setError('Failed to load manufacturing orders');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Cancel this manufacturing order?')) return;
    try {
      await manufacturingOrdersApi.cancel(id);
      loadOrders();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to cancel order');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const diffD = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (diffD === 0) return 'Today';
    if (diffD === 1) return 'Yesterday';
    if (diffD < 7) return `${diffD} days ago`;
    return date.toLocaleDateString();
  };

  const ordersByStatus = Object.fromEntries(
    MO_STATUSES.map((s) => [s, orders.filter((o) => o.status === s)])
  ) as Record<string, ManufacturingOrderListItem[]>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Manufacturing Orders</h1>
          <p className="text-slate-400 text-sm mt-1">Manage production orders and work orders</p>
        </div>
        <button
          onClick={() => navigate('/manufacturing/new')}
          className="px-4 py-2 bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-xl font-medium hover:from-violet-400 hover:to-purple-400 transition-all shadow-lg shadow-violet-500/20"
        >
          + New MO
        </button>
      </div>

      {/* Filters + View toggle */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search by reference or product..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
        >
          <option value="">All Statuses</option>
          {MO_STATUSES.map((s) => (
            <option key={s} value={s}>{MO_STATUS_LABELS[s]}</option>
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
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Table View */}
      {!loading && viewMode === 'table' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Reference</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Product</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Qty</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Status</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Date</th>
                <th className="text-right px-6 py-4 text-sm font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">No manufacturing orders found</td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer"
                    onClick={() => navigate(`/manufacturing/${order.id}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{order.reference}</span>
                        {order.auto_created && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-purple-500/20 text-purple-300">Auto</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-300">{order.finished_product_name}</td>
                    <td className="px-6 py-4 text-slate-300">{order.quantity}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${MO_STATUS_COLORS[order.status]}`}>
                        {MO_STATUS_LABELS[order.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-sm">{formatDate(order.created_at)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {!['done', 'cancelled'].includes(order.status) && (
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
          {MO_STATUSES.map((status) => (
            <div key={status} className="min-w-[200px]">
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${MO_STATUS_COLORS[status]}`}>
                  {MO_STATUS_LABELS[status]}
                </span>
                <span className="text-slate-500 text-sm">({ordersByStatus[status].length})</span>
              </div>
              <div className="space-y-3">
                {ordersByStatus[status].map((order) => (
                  <div
                    key={order.id}
                    onClick={() => navigate(`/manufacturing/${order.id}`)}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-medium text-white text-sm">{order.reference}</span>
                      {order.auto_created && (
                        <span className="px-1 py-0.5 rounded text-xs bg-purple-500/20 text-purple-300">Auto</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mb-1">{order.finished_product_name}</div>
                    <div className="flex justify-between items-center">
                      <span className="text-violet-400 text-xs font-medium">Qty: {order.quantity}</span>
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
