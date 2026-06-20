import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { salesOrdersApi } from '../../api/sales';
import type { SalesOrderListItem } from '../../types/sales';
import { STATUS_COLORS, STATUS_LABELS } from '../../types/sales';

type ViewMode = 'table' | 'kanban';

export default function SalesOrdersList() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<SalesOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  useEffect(() => {
    loadOrders();
    
    // Auto-refresh when system events occur
    const handleSystemEvent = () => loadOrders();
    window.addEventListener('systemDataChanged', handleSystemEvent);
    
    return () => {
      window.removeEventListener('systemDataChanged', handleSystemEvent);
    };
  }, [search, statusFilter]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await salesOrdersApi.list(search || undefined, statusFilter || undefined);
      setOrders(data);
      setError('');
    } catch (err) {
      setError('Failed to load sales orders');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, reference: string) => {
    if (!confirm(`Delete ${reference}? This cannot be undone.`)) return;
    try {
      await salesOrdersApi.delete(id);
      loadOrders();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete order');
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this order?')) return;
    try {
      await salesOrdersApi.cancel(id);
      loadOrders();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to cancel order');
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Group orders by status for Kanban view
  const ordersByStatus = {
    draft: orders.filter(o => o.status === 'draft'),
    confirmed: orders.filter(o => o.status === 'confirmed'),
    partially_delivered: orders.filter(o => o.status === 'partially_delivered'),
    fully_delivered: orders.filter(o => o.status === 'fully_delivered'),
    cancelled: orders.filter(o => o.status === 'cancelled'),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sales Orders</h1>
          <p className="text-slate-400 text-sm mt-1">Manage customer orders and deliveries</p>
        </div>
        <button
          onClick={() => navigate('/sales/new')}
          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium hover:from-cyan-400 hover:to-blue-400 transition-all shadow-lg shadow-cyan-500/20"
        >
          + New Sales Order
        </button>
      </div>

      {/* Filters and View Toggle */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search by reference or customer..."
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
          <option value="partially_delivered">Partially Delivered</option>
          <option value="fully_delivered">Fully Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <div className="flex bg-slate-800 rounded-xl p-1">
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'table' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Table
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'kanban' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Kanban
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
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
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Customer</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Status</th>
                <th className="text-right px-6 py-4 text-sm font-medium text-slate-400">Total</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Date</th>
                <th className="text-right px-6 py-4 text-sm font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    No sales orders found
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer"
                    onClick={() => navigate(`/sales/${order.id}`)}
                  >
                    <td className="px-6 py-4">
                      <span className="font-medium text-white">{order.reference}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-300">{order.customer_name}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                        {STATUS_LABELS[order.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-white">
                      {formatCurrency(order.total_amount)}
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-sm">
                      {formatDate(order.expected_delivery_date)}
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
                        {['draft', 'confirmed', 'partially_delivered'].includes(order.status) && (
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

      {/* Kanban View */}
      {!loading && viewMode === 'kanban' && (
        <div className="grid grid-cols-5 gap-4 overflow-x-auto pb-4">
          {(['draft', 'confirmed', 'partially_delivered', 'fully_delivered', 'cancelled'] as const).map((status) => (
            <div key={status} className="min-w-[250px]">
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
                  {STATUS_LABELS[status]}
                </span>
                <span className="text-slate-500 text-sm">({ordersByStatus[status].length})</span>
              </div>
              <div className="space-y-3">
                {ordersByStatus[status].map((order) => (
                  <div
                    key={order.id}
                    onClick={() => navigate(`/sales/${order.id}`)}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 cursor-pointer transition-colors"
                  >
                    <div className="font-medium text-white mb-1">{order.reference}</div>
                    <div className="text-sm text-slate-400 mb-2">{order.customer_name}</div>
                    <div className="flex justify-between items-center">
                      <span className="text-cyan-400 font-medium">{formatCurrency(order.total_amount)}</span>
                      <span className="text-xs text-slate-500">{formatDate(order.expected_delivery_date)}</span>
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
