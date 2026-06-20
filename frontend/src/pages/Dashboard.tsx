import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../api/client';

interface DashboardSummary {
  total_sales_orders: number;
  pending_deliveries: number;
  delayed_sales_orders: number;
  total_manufacturing_orders: number;
  delayed_manufacturing_orders: number;
  total_purchase_orders: number;
  partial_receipts: number;
  delayed_purchase_orders: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const { data } = await apiClient.get<DashboardSummary>('/dashboard/summary');
        setSummary(data);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, []);

  // Calculate total delayed across all modules
  const totalDelayed = summary
    ? summary.delayed_sales_orders + summary.delayed_manufacturing_orders + summary.delayed_purchase_orders
    : 0;

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="bg-gradient-to-r from-blue-500/10 to-emerald-500/10 border border-slate-800 rounded-2xl p-6">
        <h1 className="text-2xl font-bold text-white mb-2">
          Welcome back, {user?.name}!
        </h1>
        <p className="text-slate-400">
          You are logged in as <span className="text-blue-400">{user?.role}</span> user.
        </p>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center py-8 text-slate-400">Loading dashboard...</div>
      )}

      {/* Stats grid */}
      {summary && (
        <>
          {/* Primary metrics row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <p className="text-sm text-slate-400 mb-1">Total Sales Orders</p>
              <p className="text-3xl font-bold text-blue-400">{summary.total_sales_orders}</p>
              <p className="text-xs text-slate-500 mt-2">
                {summary.pending_deliveries} pending delivery
              </p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <p className="text-sm text-slate-400 mb-1">Total Manufacturing Orders</p>
              <p className="text-3xl font-bold text-amber-400">{summary.total_manufacturing_orders}</p>
              <p className="text-xs text-slate-500 mt-2">
                In production pipeline
              </p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <p className="text-sm text-slate-400 mb-1">Total Purchase Orders</p>
              <p className="text-3xl font-bold text-emerald-400">{summary.total_purchase_orders}</p>
              <p className="text-xs text-slate-500 mt-2">
                {summary.partial_receipts} partially received
              </p>
            </div>
          </div>

          {/* Delayed orders row - the important one */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className={`bg-slate-900 border rounded-xl p-5 ${
              totalDelayed > 0 ? 'border-red-500/50' : 'border-slate-800'
            }`}>
              <p className="text-sm text-slate-400 mb-1">Total Delayed</p>
              <p className={`text-3xl font-bold ${totalDelayed > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                {totalDelayed}
              </p>
              <p className="text-xs text-slate-500 mt-2">Across all modules</p>
            </div>
            <div className={`bg-slate-900 border rounded-xl p-5 ${
              summary.delayed_sales_orders > 0 ? 'border-red-500/30' : 'border-slate-800'
            }`}>
              <p className="text-sm text-slate-400 mb-1">Delayed Sales</p>
              <p className={`text-3xl font-bold ${
                summary.delayed_sales_orders > 0 ? 'text-red-400' : 'text-slate-400'
              }`}>
                {summary.delayed_sales_orders}
              </p>
              <p className="text-xs text-slate-500 mt-2">Past expected delivery</p>
            </div>
            <div className={`bg-slate-900 border rounded-xl p-5 ${
              summary.delayed_manufacturing_orders > 0 ? 'border-red-500/30' : 'border-slate-800'
            }`}>
              <p className="text-sm text-slate-400 mb-1">Delayed Manufacturing</p>
              <p className={`text-3xl font-bold ${
                summary.delayed_manufacturing_orders > 0 ? 'text-red-400' : 'text-slate-400'
              }`}>
                {summary.delayed_manufacturing_orders}
              </p>
              <p className="text-xs text-slate-500 mt-2">Past scheduled date</p>
            </div>
            <div className={`bg-slate-900 border rounded-xl p-5 ${
              summary.delayed_purchase_orders > 0 ? 'border-red-500/30' : 'border-slate-800'
            }`}>
              <p className="text-sm text-slate-400 mb-1">Delayed Purchases</p>
              <p className={`text-3xl font-bold ${
                summary.delayed_purchase_orders > 0 ? 'text-red-400' : 'text-slate-400'
              }`}>
                {summary.delayed_purchase_orders}
              </p>
              <p className="text-xs text-slate-500 mt-2">Past expected delivery</p>
            </div>
          </div>
        </>
      )}

      {/* User info card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Your Profile</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-500">Name</p>
            <p className="text-slate-200">{user?.name}</p>
          </div>
          <div>
            <p className="text-slate-500">Login ID</p>
            <p className="text-slate-200">{user?.login_id}</p>
          </div>
          <div>
            <p className="text-slate-500">Email</p>
            <p className="text-slate-200">{user?.email}</p>
          </div>
          <div>
            <p className="text-slate-500">Role</p>
            <p className="text-slate-200 capitalize">{user?.role || 'N/A'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
