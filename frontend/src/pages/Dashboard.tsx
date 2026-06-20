import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../api/client';

interface DashboardSummary {
  total_sales_orders: number;
  pending_deliveries: number;
  total_manufacturing_orders: number;
  delayed_orders: number;
  total_purchase_orders: number;
  partial_receipts: number;
}

interface ProductRow {
  id: string;
  name: string;
  on_hand_qty: number | string;
  free_to_use_qty: number | string;
}

// 24 bins, one per hour for the last 24h. Real audit log counts.
const BAR_COUNT = 24;

const ACCENT = {
  cyan: { bar: 'bg-cyan-400', text: 'text-cyan-300', glow: 'shadow-cyan-500/30' },
  amber: { bar: 'bg-amber-400', text: 'text-amber-300', glow: 'shadow-amber-500/30' },
  emerald: { bar: 'bg-emerald-400', text: 'text-emerald-300', glow: 'shadow-emerald-500/30' },
  rose: { bar: 'bg-rose-400', text: 'text-rose-300', glow: 'shadow-rose-500/30' },
};

interface StatCardProps {
  label: string;
  value: number | string;
  hint: string;
  accent: keyof typeof ACCENT;
  icon: React.ReactNode;
}

function StatCard({ label, value, hint, accent, icon }: StatCardProps) {
  const a = ACCENT[accent];
  return (
    <div className="relative bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden">
      {/* top accent bar */}
      <div className={`absolute top-0 left-0 right-0 h-[3px] ${a.bar} ${a.glow} shadow-lg`} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
            {label}
          </p>
          <span className={`${a.text}`}>{icon}</span>
        </div>
        <p className={`text-4xl font-bold ${a.text} tabular-nums leading-none`}>{value}</p>
        <p className="text-xs text-slate-500 mt-2">{hint}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [criticalAssets, setCriticalAssets] = useState<ProductRow[]>([]);
  const [maxOnHand, setMaxOnHand] = useState(0);
  const [hourlyActivity, setHourlyActivity] = useState<number[]>(
    Array(BAR_COUNT).fill(0)
  );
  const [activityAvailable, setActivityAvailable] = useState(true);

  useEffect(() => {
    apiClient
      .get<DashboardSummary>('/dashboard/summary')
      .then((r) => setSummary(r.data))
      .catch(() => {});

    apiClient
      .get<ProductRow[]>('/products/')
      .then((r) => {
        const sorted = [...r.data].sort(
          (a, b) => Number(a.on_hand_qty) - Number(b.on_hand_qty)
        );
        const max = Math.max(...r.data.map((p) => Number(p.on_hand_qty)), 1);
        setMaxOnHand(max);
        setCriticalAssets(sorted.slice(0, 5));
      })
      .catch(() => {});

    // Pull last 24h of audit logs and bucket per hour. Falls back silently
    // if the user lacks AuditLog/view permission (most non-admin roles).
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dateFrom = yesterday.toISOString().slice(0, 10);
    apiClient
      .get(`/audit-logs/?date_from=${dateFrom}&page_size=200`)
      .then((r) => {
        const buckets = Array(BAR_COUNT).fill(0);
        const now = Date.now();
        for (const item of (r.data as { items: { occurred_at: string }[] }).items) {
          const ageHours = Math.floor(
            (now - new Date(item.occurred_at).getTime()) / (60 * 60 * 1000)
          );
          if (ageHours >= 0 && ageHours < BAR_COUNT) {
            // bucket 0 = oldest (24h ago), bucket 23 = now
            buckets[BAR_COUNT - 1 - ageHours] += 1;
          }
        }
        setHourlyActivity(buckets);
      })
      .catch(() => {
        setActivityAvailable(false);
      });
  }, []);

  const maxHourly = Math.max(...hourlyActivity, 1);

  const lowStockCount = criticalAssets.filter(
    (p) => Number(p.free_to_use_qty) < 10
  ).length;

  const initials = (user?.name || 'U')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const shiftPercent = Math.floor(
    ((new Date().getHours() * 60 + new Date().getMinutes()) / (24 * 60)) * 100
  );

  return (
    <div className="space-y-6">
      {/* Welcome strip */}
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">
          Welcome back, {user?.name}
        </h1>
        <p className="text-slate-500 text-sm mt-1 tracking-wide">
          System operational. All nodes reporting normal performance.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Open Sales"
          value={summary?.pending_deliveries ?? '—'}
          hint={`${summary?.total_sales_orders ?? 0} total this period`}
          accent="cyan"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" />
            </svg>
          }
        />
        <StatCard
          label="Pending POs"
          value={summary?.partial_receipts ?? '—'}
          hint={`${summary?.total_purchase_orders ?? 0} total POs`}
          accent="amber"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17" />
            </svg>
          }
        />
        <StatCard
          label="Active MOs"
          value={summary?.total_manufacturing_orders ?? '—'}
          hint={`${summary?.delayed_orders ?? 0} delayed`}
          accent="emerald"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.4 15a2 2 0 00-1-.5l-2.4-.5a6 6 0 00-3.9.5l-.3.1a6 6 0 01-3.9.5L6 14.7a2 2 0 00-1.8.6M8 4h8l-1 1v5a2 2 0 00.6 1.4l5 5c1.3 1.3.4 3.4-1.4 3.4H4.8c-1.8 0-2.7-2.1-1.4-3.4l5-5A2 2 0 009 10V5L8 4z" />
            </svg>
          }
        />
        <StatCard
          label="Low Stock"
          value={String(lowStockCount).padStart(2, '0')}
          hint="Reorder threshold"
          accent="rose"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
        />
      </div>

      {/* Activity (last 24h) */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2 text-slate-300">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            <span className="text-sm font-medium text-slate-200">Activity (last 24h)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="tracking-[0.15em] uppercase">
              {activityAvailable ? 'Live signal' : 'No access'}
            </span>
          </div>
        </div>

        {/* Real per-hour audit log counts */}
        <div className="flex items-end gap-1.5 h-24">
          {hourlyActivity.map((count, i) => (
            <div
              key={i}
              title={`${count} change(s) ${BAR_COUNT - 1 - i}h ago`}
              className="flex-1 rounded-sm bg-slate-600/60"
              style={{ height: `${Math.max(4, (count / maxHourly) * 100)}%` }}
            />
          ))}
        </div>
        {/* Tick marks */}
        <div className="grid grid-cols-5 mt-3 text-[10px] tracking-[0.15em] text-slate-600 uppercase">
          <span>00:00</span>
          <span className="text-center">06:00</span>
          <span className="text-center">12:00</span>
          <span className="text-center">18:00</span>
          <span className="text-right">Now</span>
        </div>

        {/* Footer metrics — inspo style: small label, value below */}
        <div className="grid grid-cols-3 gap-6 pt-5 mt-5 border-t border-slate-800">
          <div>
            <p className="text-[10px] tracking-[0.2em] text-slate-500 uppercase">Efficiency</p>
            <p className="text-cyan-300 text-xl font-semibold tabular-nums mt-1">
              {summary
                ? (
                    100 -
                    Math.min(
                      30,
                      summary.delayed_orders * 5 +
                        summary.partial_receipts * 2
                    )
                  ).toFixed(1)
                : '0.0'}
              %
            </p>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.2em] text-slate-500 uppercase">Load Factor</p>
            <p className="text-cyan-300 text-xl font-semibold tabular-nums mt-1">
              {summary
                ? (
                    Math.min(
                      99,
                      Math.round(
                        ((summary.pending_deliveries + summary.partial_receipts) /
                          Math.max(
                            1,
                            summary.total_sales_orders + summary.total_purchase_orders
                          )) *
                          100
                      )
                    ) / 100
                  ).toFixed(2)
                : '0.00'}
            </p>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.2em] text-slate-500 uppercase">Active Nodes</p>
            <p className="text-cyan-300 text-xl font-semibold tabular-nums mt-1">
              {((summary?.total_sales_orders ?? 0) +
                (summary?.total_purchase_orders ?? 0) +
                (summary?.total_manufacturing_orders ?? 0)).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Two-column grid: Operator Data + Critical Asset Monitoring */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Operator Data */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-slate-400 uppercase mb-5">
            Operator Data
          </p>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-500/30 border border-cyan-400/40 flex items-center justify-center text-cyan-200 font-bold text-lg">
              {initials}
            </div>
            <div>
              <p className="text-white font-semibold text-lg">{user?.name}</p>
              <p className="text-slate-400 text-sm tracking-wide">
                {user?.is_system_admin
                  ? 'Level 4 Auth'
                  : user?.role
                    ? `Level 2 · ${user.role}`
                    : 'Level 1 Auth'}
              </p>
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-800 pt-4">
            <Row label="Shift Progress" value={`${shiftPercent}% / 100%`} />
            <Row label="Operator ID" value={user?.login_id ?? '—'} />
            <Row label="Channel" value={user?.email ?? '—'} />
            <Row
              label="Clearance"
              value={user?.is_system_admin ? 'System Admin' : user?.role || 'N/A'}
              valueClass="capitalize"
            />
          </div>

          <button
            onClick={() => navigate('/admin/audit')}
            className="w-full mt-6 px-4 py-3 rounded-xl bg-indigo-200 text-slate-900 text-sm font-semibold tracking-[0.25em] uppercase hover:bg-indigo-100 transition-colors cursor-pointer"
          >
            View Logs
          </button>
        </div>

        {/* Critical Asset Monitoring */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-slate-400 uppercase mb-5">
            Critical Asset Monitoring
          </p>

          <div className="space-y-4">
            <div className="grid grid-cols-12 gap-3 text-[10px] tracking-[0.2em] text-slate-500 uppercase pb-2 border-b border-slate-800">
              <span className="col-span-3">Asset ID</span>
              <span className="col-span-4">Designation</span>
              <span className="col-span-4">Stock Level</span>
              <span className="col-span-1 text-right">Qty</span>
            </div>

            {criticalAssets.length === 0 ? (
              <p className="py-8 text-center text-slate-600 text-sm">
                No assets registered yet
              </p>
            ) : (
              criticalAssets.map((p, idx) => {
                const qty = Number(p.on_hand_qty);
                const ratio = maxOnHand > 0 ? qty / maxOnHand : 0;
                const tone =
                  qty < 5
                    ? 'bg-rose-400'
                    : qty < 20
                      ? 'bg-amber-400'
                      : 'bg-cyan-400';
                return (
                  <div
                    key={p.id}
                    className="grid grid-cols-12 gap-3 items-center text-sm"
                  >
                    <span className={`col-span-3 font-mono text-xs ${ACCENT.cyan.text}`}>
                      #TRQ-{String(idx + 1).padStart(3, '0')}
                    </span>
                    <span className="col-span-4 text-slate-200 truncate">{p.name}</span>
                    <div className="col-span-4 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full ${tone} rounded-full`}
                        style={{ width: `${Math.max(4, ratio * 100)}%` }}
                      />
                    </div>
                    <span className="col-span-1 text-right text-slate-300 tabular-nums">
                      {qty}
                    </span>
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

function Row({
  label,
  value,
  valueClass = '',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[10px] tracking-[0.2em] text-slate-500 uppercase">
        {label}
      </span>
      <span className={`text-slate-200 ${valueClass}`}>{value}</span>
    </div>
  );
}
