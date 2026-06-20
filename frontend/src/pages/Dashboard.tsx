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

// ============================================================================
// Gauge — circular instrument-cluster style indicator
// ============================================================================

interface GaugeProps {
  label: string;
  sublabel: string;
  value: number;
  max: number; // hard ceiling for the arc; values above clamp to full
  unit?: string;
  /** primary color of the filled arc */
  color: string;
  /** glow color of the needle tip */
  glow: string;
  /** decorative "redline" zone start, as fraction 0..1 */
  redlineFrom?: number;
}

function Gauge({ label, sublabel, value, max, unit, color, glow, redlineFrom = 0.8 }: GaugeProps) {
  // Arc spans 220 degrees centered at bottom (from -200° to +20°)
  const START = -200; // degrees
  const END = 20;
  const SWEEP = END - START; // 220
  const ratio = Math.min(1, Math.max(0, value / Math.max(max, 1)));
  const valueAngle = START + SWEEP * ratio;

  // Compute SVG arc path for the filled portion
  const cx = 110;
  const cy = 110;
  const r = 86;
  const polar = (angleDeg: number, radius: number) => {
    const a = ((angleDeg) * Math.PI) / 180;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)] as const;
  };

  const arcPath = (a0: number, a1: number, radius: number) => {
    const [x0, y0] = polar(a0, radius);
    const [x1, y1] = polar(a1, radius);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`;
  };

  // Tick marks every 11° (20 ticks across the sweep)
  const ticks = Array.from({ length: 21 }, (_, i) => START + (SWEEP / 20) * i);
  const redStart = START + SWEEP * redlineFrom;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-5">
      {/* Top accent stripe */}
      <div className={`absolute left-0 right-0 top-0 h-[2px] ${color.replace('text-', 'bg-')} opacity-70`} />

      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">{label}</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-600 mt-0.5">{sublabel}</p>
        </div>
        <span className={`text-[9px] tracking-[0.2em] uppercase ${color}`}>● Live</span>
      </div>

      <div className="relative">
        <svg viewBox="0 0 220 150" className="w-full h-auto">
          {/* Backing arc */}
          <path d={arcPath(START, END, r)} fill="none" stroke="#1e293b" strokeWidth="10" strokeLinecap="round" />

          {/* Redline section (decorative warning zone) */}
          <path
            d={arcPath(redStart, END, r)}
            fill="none"
            stroke="#7f1d1d"
            strokeOpacity="0.4"
            strokeWidth="10"
            strokeLinecap="round"
          />

          {/* Filled arc up to value */}
          {ratio > 0 && (
            <path
              d={arcPath(START, valueAngle, r)}
              fill="none"
              className={color.replace('text-', 'stroke-')}
              strokeWidth="10"
              strokeLinecap="round"
            />
          )}

          {/* Tick marks */}
          {ticks.map((angle, i) => {
            const inner = i % 5 === 0 ? r - 18 : r - 10;
            const outer = r - 4;
            const [x0, y0] = polar(angle, inner);
            const [x1, y1] = polar(angle, outer);
            const isRed = angle >= redStart;
            return (
              <line
                key={i}
                x1={x0}
                y1={y0}
                x2={x1}
                y2={y1}
                stroke={isRed ? '#dc2626' : '#475569'}
                strokeWidth={i % 5 === 0 ? 1.5 : 0.8}
              />
            );
          })}

          {/* Needle tip indicator (a small dot at the current angle) */}
          <circle cx={polar(valueAngle, r)[0]} cy={polar(valueAngle, r)[1]} r="4" className={color.replace('text-', 'fill-')} style={{ filter: `drop-shadow(0 0 6px ${glow})` }} />
        </svg>

        {/* Center readout */}
        <div className="absolute inset-x-0 top-[56%] -translate-y-1/2 flex flex-col items-center pointer-events-none">
          <span
            className={`text-4xl font-black tabular-nums leading-none ${color}`}
            style={{ fontFamily: 'Bahnschrift Condensed, Arial Narrow, sans-serif', letterSpacing: '0.02em' }}
          >
            {value.toLocaleString()}
          </span>
          {unit && (
            <span className="mt-1 text-[9px] tracking-[0.25em] uppercase text-slate-500">{unit}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Warning light — small "dashboard idiot light" indicator
// ============================================================================

function WarningLight({
  label,
  value,
  tone,
  icon,
  active,
}: {
  label: string;
  value: number | string;
  tone: 'cyan' | 'amber' | 'rose' | 'emerald';
  icon: React.ReactNode;
  active: boolean;
}) {
  const TONE: Record<typeof tone, { bg: string; text: string; ring: string; glow: string }> = {
    cyan: { bg: 'bg-cyan-500/15', text: 'text-cyan-300', ring: 'ring-cyan-500/40', glow: 'shadow-cyan-500/40' },
    amber: { bg: 'bg-amber-500/15', text: 'text-amber-300', ring: 'ring-amber-500/40', glow: 'shadow-amber-500/40' },
    rose: { bg: 'bg-rose-500/15', text: 'text-rose-300', ring: 'ring-rose-500/40', glow: 'shadow-rose-500/40' },
    emerald: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', ring: 'ring-emerald-500/40', glow: 'shadow-emerald-500/40' },
  };
  const t = TONE[tone];
  return (
    <div className="relative flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${active ? `${t.bg} ${t.text} ring-1 ${t.ring} shadow-lg ${t.glow}` : 'bg-slate-800/70 text-slate-600 ring-1 ring-slate-800'}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] uppercase tracking-[0.22em] text-slate-500 truncate">{label}</p>
        <p className={`text-xl font-bold tabular-nums leading-tight ${active ? t.text : 'text-slate-500'}`} style={{ fontFamily: 'Bahnschrift Condensed, Arial Narrow, sans-serif' }}>{value}</p>
      </div>
      {active && (
        <span className={`absolute right-3 top-3 h-1.5 w-1.5 rounded-full ${t.text.replace('text-', 'bg-')} animate-pulse`} />
      )}
    </div>
  );
}

// ============================================================================
// Racing stripe header accent
// ============================================================================

function RacingStripe() {
  return (
    <div
      className="absolute inset-x-0 top-0 h-1 opacity-80"
      style={{
        background:
          'repeating-linear-gradient(135deg, transparent 0 18px, rgba(6,182,212,0.35) 18px 24px, transparent 24px 36px, rgba(244,114,182,0.25) 36px 42px)',
      }}
    />
  );
}

// ============================================================================
// Dashboard
// ============================================================================

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [criticalAssets, setCriticalAssets] = useState<ProductRow[]>([]);
  const [maxOnHand, setMaxOnHand] = useState(0);
  const [hourlyActivity, setHourlyActivity] = useState<number[]>(Array(BAR_COUNT).fill(0));
  const [activityAvailable, setActivityAvailable] = useState(true);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    apiClient.get<DashboardSummary>('/dashboard/summary').then((r) => setSummary(r.data)).catch(() => {});

    apiClient.get<ProductRow[]>('/products/').then((r) => {
      const sorted = [...r.data].sort((a, b) => Number(a.on_hand_qty) - Number(b.on_hand_qty));
      const max = Math.max(...r.data.map((p) => Number(p.on_hand_qty)), 1);
      setMaxOnHand(max);
      setCriticalAssets(sorted.slice(0, 5));
    }).catch(() => {});

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dateFrom = yesterday.toISOString().slice(0, 10);
    apiClient.get(`/audit-logs/?date_from=${dateFrom}&page_size=200`).then((r) => {
      const buckets = Array(BAR_COUNT).fill(0);
      const t = Date.now();
      for (const item of (r.data as { items: { occurred_at: string }[] }).items) {
        const ageHours = Math.floor((t - new Date(item.occurred_at).getTime()) / (60 * 60 * 1000));
        if (ageHours >= 0 && ageHours < BAR_COUNT) buckets[BAR_COUNT - 1 - ageHours] += 1;
      }
      setHourlyActivity(buckets);
    }).catch(() => setActivityAvailable(false));

    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const maxHourly = Math.max(...hourlyActivity, 1);
  const initials = (user?.name || 'U').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  const delayedTotal = summary
    ? (summary.delayed_orders ?? 0) + (summary.delayed_sales_orders ?? 0) +
      (summary.delayed_manufacturing_orders ?? 0) + (summary.delayed_purchase_orders ?? 0)
    : 0;

  // Auto-scale gauge ceilings based on observed values so the needle never pins flat or maxes out instantly.
  const salesMax = Math.max(10, (summary?.total_sales_orders ?? 0) * 1.3);
  const prodMax = Math.max(10, (summary?.total_manufacturing_orders ?? 0) * 1.3);
  const purchMax = Math.max(10, (summary?.total_purchase_orders ?? 0) * 1.3);

  // Inventory health: fraction of products with positive on-hand
  const stockHealth = criticalAssets.length === 0
    ? 0
    : criticalAssets.filter((p) => Number(p.on_hand_qty) > 0).length;

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className="relative space-y-6">
      <RacingStripe />

      {/* ════════════ Command header ════════════ */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 px-6 py-5">
        {/* Subtle diagonal stripe background */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg, #fff 0 1px, transparent 1px 14px)',
          }}
        />

        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold tracking-[0.4em] text-cyan-300 uppercase">
                Fleet Command
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-cyan-500/40 to-transparent" />
            </div>
            <h1
              className="mt-2 text-3xl font-black tracking-tight text-white"
              style={{ fontFamily: 'Bahnschrift Condensed, Arial Narrow, Segoe UI, sans-serif' }}
            >
              WELCOME BACK, {user?.name?.toUpperCase()}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              All systems armed · perimeter green · {activityAvailable ? 'telemetry online' : 'telemetry restricted'}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-2 text-right">
              <p className="text-[9px] tracking-[0.3em] uppercase text-slate-500">Local Time</p>
              <p
                className="text-2xl font-black tabular-nums text-cyan-300"
                style={{ fontFamily: 'Bahnschrift Condensed, Arial Narrow, sans-serif' }}
              >
                {timeStr}
              </p>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <p className="text-[9px] tracking-[0.3em] uppercase text-emerald-300">Status</p>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200">Armed</p>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════ Instrument cluster (3 gauges) ════════════ */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Gauge
          label="Sales Throughput"
          sublabel="Total Orders Cycle"
          value={summary?.total_sales_orders ?? 0}
          max={salesMax}
          unit="Orders"
          color="text-cyan-300"
          glow="rgba(34,211,238,0.7)"
          redlineFrom={0.85}
        />
        <Gauge
          label="Production RPM"
          sublabel="Manufacturing Orders"
          value={summary?.total_manufacturing_orders ?? 0}
          max={prodMax}
          unit="MOs Active"
          color="text-emerald-300"
          glow="rgba(52,211,153,0.7)"
          redlineFrom={0.85}
        />
        <Gauge
          label="Purchase Velocity"
          sublabel="Vendor Receipts"
          value={summary?.total_purchase_orders ?? 0}
          max={purchMax}
          unit="POs Issued"
          color="text-amber-300"
          glow="rgba(252,211,77,0.7)"
          redlineFrom={0.85}
        />
      </div>

      {/* ════════════ Warning lights bar ════════════ */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">
            Indicator Cluster
          </p>
          <span className="text-[9px] tracking-[0.2em] uppercase text-slate-600">
            illuminated when active
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <WarningLight
            label="Pending Deliveries"
            value={summary?.pending_deliveries ?? 0}
            tone="cyan"
            active={(summary?.pending_deliveries ?? 0) > 0}
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7h13l3 3v6h-2a3 3 0 11-6 0H8a3 3 0 11-6 0V7z" />
              </svg>
            }
          />
          <WarningLight
            label="Partial Receipts"
            value={summary?.partial_receipts ?? 0}
            tone="amber"
            active={(summary?.partial_receipts ?? 0) > 0}
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v3m0 3h.01M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
          />
          <WarningLight
            label="Delayed Orders"
            value={delayedTotal}
            tone="rose"
            active={delayedTotal > 0}
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l2 2m6-2a8 8 0 11-16 0 8 8 0 0116 0z" />
              </svg>
            }
          />
          <WarningLight
            label="Stock Bays Active"
            value={`${stockHealth}/${criticalAssets.length || 0}`}
            tone="emerald"
            active={stockHealth > 0}
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0v10l-8 4-8-4V7m16 0l-8 4-8-4" />
              </svg>
            }
          />
        </div>
      </div>

      {/* ════════════ Telemetry trace ════════════ */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">
              Telemetry Trace
            </p>
            <p
              className="mt-0.5 text-lg font-bold tracking-tight text-white"
              style={{ fontFamily: 'Bahnschrift Condensed, Arial Narrow, sans-serif' }}
            >
              ACTIVITY · LAST 24H
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className={`h-1.5 w-1.5 rounded-full ${activityAvailable ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            <span className="uppercase tracking-[0.2em] text-[9px]">
              {activityAvailable ? 'Signal locked' : 'Signal restricted'}
            </span>
          </div>
        </div>

        {/* Grid background + bars */}
        <div className="relative">
          {/* Horizontal grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-px bg-slate-800" />
            ))}
          </div>

          <div className="relative flex h-32 items-end gap-1.5">
            {hourlyActivity.map((count, i) => {
              const h = Math.max(3, (count / maxHourly) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col justify-end" title={`${count} change(s) ${BAR_COUNT - 1 - i}h ago`}>
                  <div
                    className="rounded-t-sm bg-gradient-to-t from-cyan-500/40 via-cyan-400/60 to-cyan-300/80"
                    style={{ height: `${h}%` }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-5 text-[9px] uppercase tracking-[0.2em] text-slate-600">
          <span>−24h</span>
          <span className="text-center">−18h</span>
          <span className="text-center">−12h</span>
          <span className="text-center">−06h</span>
          <span className="text-right">Now</span>
        </div>

        {/* Footer telemetry stats */}
        <div className="mt-5 grid grid-cols-3 gap-6 border-t border-slate-800 pt-4">
          <TelemetryStat
            label="Efficiency"
            value={`${summary ? (100 - Math.min(30, delayedTotal * 5 + (summary.partial_receipts || 0) * 2)).toFixed(1) : '0.0'}%`}
          />
          <TelemetryStat
            label="Load Factor"
            value={summary
              ? (Math.min(99, Math.round(((summary.pending_deliveries + summary.partial_receipts) / Math.max(1, summary.total_sales_orders + summary.total_purchase_orders)) * 100)) / 100).toFixed(2)
              : '0.00'}
          />
          <TelemetryStat
            label="Active Nodes"
            value={((summary?.total_sales_orders ?? 0) + (summary?.total_purchase_orders ?? 0) + (summary?.total_manufacturing_orders ?? 0)).toLocaleString()}
          />
        </div>
      </div>

      {/* ════════════ Pilot Identity + Parts Inventory Bay ════════════ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Pilot identity (2/5 width) */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6">
          {/* Diagonal stripe accent (top-right corner) */}
          <div
            className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 opacity-30"
            style={{
              background:
                'repeating-linear-gradient(135deg, rgba(34,211,238,0.4) 0 4px, transparent 4px 10px)',
            }}
          />

          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500 mb-4">
            Pilot Identity
          </p>

          <div className="flex items-center gap-4 mb-5">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-xl border-2 border-cyan-400/50 bg-gradient-to-br from-cyan-500/30 to-blue-500/30 text-xl font-black text-cyan-200">
              {initials}
              <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-slate-950 animate-pulse" />
            </div>
            <div>
              <p className="text-lg font-bold text-white tracking-tight">{user?.name}</p>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mt-0.5">
                {user?.is_system_admin ? 'Class A · System Admin' : user?.role ? `Class B · ${user.role}` : 'Class C'}
              </p>
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-800 pt-4">
            <PilotRow label="Operator ID" value={user?.login_id ?? '—'} />
            <PilotRow label="Channel" value={user?.email ?? '—'} />
            <PilotRow label="Shift Status" value="On Duty" tone="emerald" />
            <PilotRow label="Clearance" value={user?.is_system_admin ? 'Sys-Admin' : user?.role || 'N/A'} mono />
          </div>

          <button
            onClick={() => navigate('/admin/audit')}
            className="mt-6 w-full rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300 transition-colors hover:bg-cyan-500/20"
          >
            View Telemetry Logs
          </button>
        </div>

        {/* Parts Inventory Bay (3/5 width) */}
        <div className="lg:col-span-3 relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                Parts Inventory Bay
              </p>
              <p
                className="mt-0.5 text-lg font-bold tracking-tight text-white"
                style={{ fontFamily: 'Bahnschrift Condensed, Arial Narrow, sans-serif' }}
              >
                CRITICAL STOCK MONITOR
              </p>
            </div>
            <button
              onClick={() => navigate('/products')}
              className="text-[10px] tracking-[0.2em] uppercase text-slate-500 hover:text-cyan-300"
            >
              View All →
            </button>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-3 border-b border-slate-800 pb-2 text-[9px] uppercase tracking-[0.22em] text-slate-600">
              <span className="col-span-2">Bay</span>
              <span className="col-span-4">Component</span>
              <span className="col-span-5">Fill Level</span>
              <span className="col-span-1 text-right">Qty</span>
            </div>

            {criticalAssets.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-600">
                No components registered yet
              </p>
            ) : (
              criticalAssets.map((product, i) => {
                const qty = Number(product.on_hand_qty);
                const ratio = maxOnHand > 0 ? qty / maxOnHand : 0;
                const tone =
                  qty <= 0 ? 'bg-rose-500' :
                  qty < 5 ? 'bg-rose-400' :
                  qty < 20 ? 'bg-amber-400' :
                  'bg-emerald-400';
                const label =
                  qty <= 0 ? 'EMPTY' :
                  qty < 5 ? 'LOW' :
                  qty < 20 ? 'WATCH' :
                  'OK';
                return (
                  <div
                    key={product.id}
                    className="grid grid-cols-12 items-center gap-3 rounded-lg border border-transparent bg-slate-900/40 px-3 py-2.5 transition-colors hover:border-slate-700"
                  >
                    <span className="col-span-2 font-mono text-[11px] tracking-wider text-cyan-300">
                      #B-{String(i + 1).padStart(3, '0')}
                    </span>
                    <span className="col-span-4 text-sm text-slate-200 truncate">{product.name}</span>
                    <div className="col-span-5 flex items-center gap-3">
                      <div className="flex-1 h-2 overflow-hidden rounded-full bg-slate-800 ring-1 ring-slate-800">
                        <div
                          className={`h-full rounded-full ${tone}`}
                          style={{
                            width: `${Math.max(3, ratio * 100)}%`,
                            boxShadow: `0 0 8px currentColor`,
                          }}
                        />
                      </div>
                      <span className={`text-[9px] font-semibold tracking-wider uppercase w-12 text-right ${
                        qty <= 0 ? 'text-rose-400' :
                        qty < 5 ? 'text-rose-300' :
                        qty < 20 ? 'text-amber-300' :
                        'text-emerald-300'
                      }`}>
                        {label}
                      </span>
                    </div>
                    <span
                      className="col-span-1 text-right font-bold tabular-nums text-white"
                      style={{ fontFamily: 'Bahnschrift Condensed, Arial Narrow, sans-serif' }}
                    >
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

function TelemetryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p
        className="mt-1 text-2xl font-black tabular-nums text-cyan-300"
        style={{ fontFamily: 'Bahnschrift Condensed, Arial Narrow, sans-serif' }}
      >
        {value}
      </p>
    </div>
  );
}

function PilotRow({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: 'emerald';
  mono?: boolean;
}) {
  const valueColor = tone === 'emerald' ? 'text-emerald-300' : 'text-slate-200';
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[9px] uppercase tracking-[0.25em] text-slate-500">{label}</span>
      <span className={`${valueColor} ${mono ? 'font-mono text-xs' : ''} capitalize`}>{value}</span>
    </div>
  );
}
