import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { manufacturingOrdersApi } from '../../api/manufacturing';
import type { ManufacturingOrderListItem } from '../../types/manufacturing';
import { MO_STATUS_COLORS, MO_STATUS_LABELS } from '../../types/manufacturing';

export default function ManufacturingOrdersList() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<ManufacturingOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    loadOrders();
  }, [search, statusFilter]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await manufacturingOrdersApi.list(search || undefined, statusFilter || undefined);
      setOrders(data);
      setError('');
    } catch (err) {
      setError('Failed to load manufacturing orders');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this manufacturing order?')) return;
    try {
      await manufacturingOrdersApi.cancel(id);
      loadOrders();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to cancel order');
    }
  };

  const handleDelete = async (id: string, reference: string) => {
    if (!confirm(`Delete ${reference}? This cannot be undone.`)) return;
    try {
      await manufacturingOrdersApi.delete(id);
      loadOrders();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete order');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Manufacturing Orders</h1>
          <p className="text-slate-400 text-sm mt-1">Production orders and work execution</p>
        </div>
        <button
          onClick={() => navigate('/manufacturing/new')}
          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium hover:from-cyan-400 hover:to-blue-400 transition-all shadow-lg shadow-cyan-500/20"
        >
          + New Manufacturing Order
        </button>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search by reference or product..."
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
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Reference</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Finished Product</th>
                <th className="text-right px-6 py-4 text-sm font-medium text-slate-400">Qty</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Status</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Date</th>
                <th className="text-right px-6 py-4 text-sm font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    No manufacturing orders found
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer"
                    onClick={() => navigate(`/manufacturing/${order.id}`)}
                  >
                    <td className="px-6 py-4">
                      <span className="font-medium text-white">{order.reference}</span>
                      {order.auto_created && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/20 text-cyan-300">
                          AUTO
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-300">{order.finished_product_name}</td>
                    <td className="px-6 py-4 text-right text-white font-medium">{order.quantity}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${MO_STATUS_COLORS[order.status]}`}>
                        {MO_STATUS_LABELS[order.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-sm">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {order.status === 'draft' && (
                          <button
                            onClick={() => handleDelete(order.id, order.reference)}
                            className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded"
                          >
                            Delete
                          </button>
                        )}
                        {['draft', 'confirmed', 'in_progress'].includes(order.status) && (
                          <button
                            onClick={() => handleCancel(order.id)}
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
    </div>
  );
}
