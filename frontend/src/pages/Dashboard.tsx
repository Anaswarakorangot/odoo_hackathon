import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../api/client';

interface DashboardSummary {
  total_sales_orders: number;
  pending_deliveries: number;
  delayed_sales_orders?: number;
  total_manufacturing_orders: number;
  delayed_manufacturing_orders?: number;
  total_purchase_orders: number;
  partial_receipts: number;
  delayed_purchase_orders?: number;
  delayed_orders?: number;
}

interface ProductRow {
  id: string;
  name: string;
  on_hand_qty: number | string;
  free_to_use_qty: number | string;
}

const BAR_COUNT = 24;

const ACCENT = {
  cyan: { bar: 'bg-cyan-400', text: 'text-cyan-300', glow: 'shadow-cyan-500/30' },
  amber: { bar: 'bg-amber-400', text: 'text-amber-300', glow: 'shadow-amber-500/30' },
  emerald: { bar: 'bg-emerald-400', text: 'text-emerald-300', glow: 'shadow-emerald-500/30' },
  rose: { bar: 'bg-rose-400', text: 'text-rose-300', glow: 'shadow-rose-500/30' },
};

function StatCard({ label, value, hint, accent, icon }: { label: string; value: number | string; hint: string; accent: keyof typeof ACCENT; icon: React.ReactNode }) {
  const a = ACCENT[accent];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
      <div className={`absolute left-0 right-0 top-0 h-[3px] ${a.bar} ${a.glow} shadow-lg`} />
      <div className="p-5">
        <div className="mb-3 flex items-start justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
          <span className={a.text}>{icon}</span>
        </div>
        <p className={`text-4xl font-bold tabular-nums leading-none ${a.text}`}>{value}</p>
        <p className="mt-2 text-xs text-slate-500">{hint}</p>
      </div>
    </div>
  );
}

function Row({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800 py-2 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm text-slate-200 ${valueClass}`.trim()}>{value}</span>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [criticalAssets, setCriticalAssets] = useState<ProductRow[]>([]);
  const [maxOnHand, setMaxOnHand] = useState(0);
  const [hourlyActivity, setHourlyActivity] = useState<number[]>(Array(BAR_COUNT).fill(0));
  const [activityAvailable, setActivityAvailable] = useState(true);

  useEffect(() => {
    apiClient.get<DashboardSummary>('/dashboard/summary').then((response) => setSummary(response.data)).catch(() => {});

    apiClient.get<ProductRow[]>('/products/').then((response) => {
      const sorted = [...response.data].sort((a, b) => Number(a.on_hand_qty) - Number(b.on_hand_qty));
      const max = Math.max(...response.data.map((product) => Number(product.on_hand_qty)), 1);
      setMaxOnHand(max);
      setCriticalAssets(sorted.slice(0, 5));
    }).catch(() => {});

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dateFrom = yesterday.toISOString().slice(0, 10);
    apiClient.get(`/audit-logs/?date_from=${dateFrom}&page_size=200`).then((response) => {
      const buckets = Array(BAR_COUNT).fill(0);
      const now = Date.now();
      for (const item of (response.data as { items: { occurred_at: string }[] }).items) {
        const ageHours = Math.floor((now - new Date(item.occurred_at).getTime()) / (60 * 60 * 1000));
        if (ageHours >= 0 && ageHours < BAR_COUNT) buckets[BAR_COUNT - 1 - ageHours] += 1;
      }
      setHourlyActivity(buckets);
    }).catch(() => setActivityAvailable(false));
  }, []);

  const maxHourly = Math.max(...hourlyActivity, 1);
  const lowStockCount = criticalAssets.filter((product) => Number(product.free_to_use_qty) < 10).length;
  const initials = (user?.name || 'U').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  const delayedTotal = summary
    ? (summary.delayed_orders ?? 0) + (summary.delayed_sales_orders ?? 0) + (summary.delayed_manufacturing_orders ?? 0) + (summary.delayed_purchase_orders ?? 0)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Welcome back, {user?.name}</h1>
        <p className="mt-1 text-sm tracking-wide text-slate-500">System operational. All nodes reporting normal performance.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Sales Orders" value={summary?.total_sales_orders ?? '—'} hint="All time sales" accent="cyan" icon={<span>◆</span>} />
        <StatCard label="Pending Deliveries" value={summary?.pending_deliveries ?? '—'} hint="Orders awaiting fulfillment" accent="cyan" icon={<span>◆</span>} />
        <StatCard label="Total Purchase Orders" value={summary?.total_purchase_orders ?? '—'} hint="All time purchases" accent="amber" icon={<span>◆</span>} />
        <StatCard label="Partial Receipts" value={summary?.partial_receipts ?? '—'} hint="Incomplete shipments" accent="amber" icon={<span>◆</span>} />
        <StatCard label="Manufacturing Orders" value={summary?.total_manufacturing_orders ?? '—'} hint="Total production orders" accent="emerald" icon={<span>◆</span>} />
        <StatCard label="Delayed Orders" value={summary?.delayed_orders ?? '—'} hint="Past scheduled date" accent="rose" icon={<span>◆</span>} />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-300">
            <span className="text-slate-400">Activity (last 24h)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="uppercase tracking-[0.15em]">{activityAvailable ? 'Live signal' : 'No access'}</span>
          </div>
        </div>

        <div className="flex h-24 items-end gap-1.5">
          {hourlyActivity.map((count, index) => (
            <div key={index} title={`${count} change(s) ${BAR_COUNT - 1 - index}h ago`} className="flex-1 rounded-sm bg-slate-600/60" style={{ height: `${Math.max(4, (count / maxHourly) * 100)}%` }} />
          ))}
        </div>

        <div className="mt-3 grid grid-cols-5 text-[10px] uppercase tracking-[0.15em] text-slate-600">
          <span>00:00</span>
          <span className="text-center">06:00</span>
          <span className="text-center">12:00</span>
          <span className="text-center">18:00</span>
          <span className="text-right">Now</span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-6 border-t border-slate-800 pt-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Efficiency</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-cyan-300">{summary ? (100 - Math.min(30, delayedTotal * 5 + (summary.partial_receipts || 0) * 2)).toFixed(1) : '0.0'}%</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Load Factor</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-cyan-300">{summary ? (Math.min(99, Math.round(((summary.pending_deliveries + summary.partial_receipts) / Math.max(1, summary.total_sales_orders + summary.total_purchase_orders)) * 100)) / 100).toFixed(2) : '0.00'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Active Nodes</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-cyan-300">{((summary?.total_sales_orders ?? 0) + (summary?.total_purchase_orders ?? 0) + (summary?.total_manufacturing_orders ?? 0)).toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Operator Data</p>
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-cyan-400/40 bg-gradient-to-br from-cyan-500/30 to-blue-500/30 text-lg font-bold text-cyan-200">{initials}</div>
            <div>
              <p className="text-lg font-semibold text-white">{user?.name}</p>
              <p className="text-sm tracking-wide text-slate-400">{user?.is_system_admin ? 'Level 4 Auth' : user?.role ? `Level 2 · ${user.role}` : 'Level 1 Auth'}</p>
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-800 pt-4">
            <Row label="Shift Progress" value="Current shift active" />
            <Row label="Operator ID" value={user?.login_id ?? '—'} />
            <Row label="Channel" value={user?.email ?? '—'} />
            <Row label="Clearance" value={user?.is_system_admin ? 'System Admin' : user?.role || 'N/A'} valueClass="capitalize" />
          </div>

          <button onClick={() => navigate('/admin/audit')} className="mt-6 w-full rounded-xl bg-indigo-200 px-4 py-3 text-sm font-semibold uppercase tracking-[0.25em] text-slate-900 transition-colors hover:bg-indigo-100">View Logs</button>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Critical Asset Monitoring</p>
          <div className="space-y-4">
            <div className="grid grid-cols-12 gap-3 border-b border-slate-800 pb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">
              <span className="col-span-3">Asset ID</span>
              <span className="col-span-4">Designation</span>
              <span className="col-span-4">Stock Level</span>
              <span className="col-span-1 text-right">Qty</span>
            </div>
            {criticalAssets.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-600">No assets registered yet</p>
            ) : (
              criticalAssets.map((product, index) => {
                const qty = Number(product.on_hand_qty);
                const ratio = maxOnHand > 0 ? qty / maxOnHand : 0;
                const tone = qty < 5 ? 'bg-rose-400' : qty < 20 ? 'bg-amber-400' : 'bg-cyan-400';
                return (
                  <div key={product.id} className="grid grid-cols-12 items-center gap-3 text-sm">
                    <span className="col-span-3 font-mono text-xs text-cyan-300">#TRQ-{String(index + 1).padStart(3, '0')}</span>
                    <span className="col-span-4 text-slate-200">{product.name}</span>
                    <span className="col-span-4 h-2 overflow-hidden rounded-full bg-slate-800"><span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.max(5, ratio * 100)}%` }} /></span>
                    <span className="col-span-1 text-right text-slate-300">{qty}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}