import { useEffect, useState } from 'react';
import { aiApi } from '../../api/ai';
import { bomsApi } from '../../api/manufacturing';
import { ReactFlow, Controls, Background, MiniMap, MarkerType } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Bom, BomOption } from '../../types/manufacturing';

interface ForecastItem {
  product_id: string;
  product_name: string;
  product_type: string;
  current_stock: number;
  free_stock: number;
  reserved_qty: number;
  inbound_qty: number;
  pending_demand: number;
  predicted_demand_30d: number;
  shortage_probability: number;
  recommendation: string;
  reasoning: string[];
}

interface AnomalyItem {
  id: string;
  type: string;
  severity: string;
  description: string;
  affected_modules: string[];
  reasoning: string;
  metric?: string;
}

const SEVERITY_CONFIG: Record<string, { bg: string; border: string; text: string; dot: string; badge: string }> = {
  High:   { bg: 'bg-rose-500/5',   border: 'border-rose-500/25',   text: 'text-rose-400',   dot: 'bg-rose-500',   badge: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  Medium: { bg: 'bg-amber-500/5',  border: 'border-amber-500/25',  text: 'text-amber-400',  dot: 'bg-amber-500',  badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  Low:    { bg: 'bg-blue-500/5',   border: 'border-blue-500/25',   text: 'text-blue-400',   dot: 'bg-blue-500',   badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  None:   { bg: 'bg-emerald-500/5',border: 'border-emerald-500/25',text: 'text-emerald-400',dot: 'bg-emerald-500',badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
};

const TYPE_ICONS: Record<string, string> = {
  'Quality Control':     '🔬',
  'Production Delay':    '⏱️',
  'Supply Chain Delay':  '🚢',
  'Component Stock-out': '📦',
  'Idle Inventory':      '🏭',
  'System Health':       '✅',
};

function RiskBar({ probability }: { probability: number }) {
  const pct = Math.round(probability * 100);
  const color = probability > 0.8 ? 'bg-rose-500' : probability > 0.6 ? 'bg-orange-500' : probability > 0.3 ? 'bg-amber-500' : 'bg-emerald-500';
  const glow  = probability > 0.8 ? 'shadow-rose-500/40' : probability > 0.6 ? 'shadow-orange-500/40' : '';
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>Shortage Risk</span>
        <span className={probability > 0.6 ? 'text-rose-400 font-bold' : 'text-slate-400'}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color} shadow-sm ${glow}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ForecastCard({ item, index }: { item: ForecastItem; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round(item.shortage_probability * 100);
  const isHigh = item.shortage_probability > 0.8;
  const isMed  = item.shortage_probability > 0.5;
  const riskLabel = isHigh ? 'Critical' : isMed ? 'Elevated' : 'Low Risk';
  const riskColor = isHigh ? 'text-rose-400 bg-rose-500/10 border-rose-500/30' : isMed ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';

  return (
    <div
      className={`rounded-xl border bg-slate-800/40 overflow-hidden transition-all duration-200 hover:border-slate-600 ${isHigh ? 'border-rose-500/30' : 'border-slate-700/50'}`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {isHigh && (
        <div className="h-0.5 w-full bg-gradient-to-r from-rose-500/0 via-rose-500 to-rose-500/0" />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="font-semibold text-slate-100 text-sm leading-tight">{item.product_name}</h3>
            <span className="text-xs text-slate-500 capitalize">{item.product_type.replace('_', ' ')}</span>
          </div>
          <span className={`shrink-0 px-2.5 py-1 text-xs font-bold rounded-full border ${riskColor}`}>
            {pct}% · {riskLabel}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-2">
          {[
            { label: 'On Hand', value: item.current_stock, highlight: item.current_stock < item.predicted_demand_30d },
            { label: 'Free Stock', value: item.free_stock },
            { label: 'Reserved',  value: item.reserved_qty },
            { label: 'Inbound PO', value: item.inbound_qty, highlight: item.inbound_qty > 0, positive: true },
            { label: 'Pending Demand', value: item.pending_demand, highlight: item.pending_demand > 0 },
            { label: 'Forecast 30d', value: item.predicted_demand_30d },
          ].map(({ label, value, highlight, positive }) => (
            <div key={label}>
              <span className="text-slate-500">{label}: </span>
              <span className={highlight ? (positive ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold') : 'text-slate-300'}>
                {value}
              </span>
            </div>
          ))}
        </div>

        <RiskBar probability={item.shortage_probability} />

        <div className="mt-3 text-xs text-indigo-300 bg-indigo-500/10 rounded-lg px-3 py-2 border border-indigo-500/20 leading-relaxed">
          ⚡ {item.recommendation}
        </div>

        {item.reasoning.length > 0 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="mt-2 text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
          >
            <span>{expanded ? '▾' : '▸'}</span>
            {expanded ? 'Hide reasoning' : 'See AI reasoning'}
          </button>
        )}
        {expanded && (
          <ul className="mt-2 space-y-1">
            {item.reasoning.map((r, i) => (
              <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                <span className="text-indigo-400 mt-0.5">•</span>
                {r}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AnomalyCard({ item, index }: { item: AnomalyItem; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.None;
  const icon = TYPE_ICONS[item.type] || '⚠️';

  return (
    <div
      className={`rounded-xl border ${cfg.bg} ${cfg.border} overflow-hidden transition-all duration-200 hover:border-opacity-50`}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">{icon}</span>
            <div>
              <h3 className="font-semibold text-slate-100 text-sm">{item.type}</h3>
              {item.metric && <p className="text-xs text-slate-500 mt-0.5">{item.metric}</p>}
            </div>
          </div>
          <span className={`shrink-0 px-2.5 py-1 text-xs font-bold rounded-full border ${cfg.badge}`}>
            {item.severity}
          </span>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed mb-2">{item.description}</p>

        {item.affected_modules.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {item.affected_modules.map(m => (
              <span key={m} className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-slate-700/60 text-slate-400 rounded border border-slate-600/40">
                {m}
              </span>
            ))}
          </div>
        )}

        {item.reasoning && (
          <>
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
            >
              <span>{expanded ? '▾' : '▸'}</span>
              {expanded ? 'Hide AI reasoning' : 'Why is this flagged?'}
            </button>
            {expanded && (
              <div className="mt-2 text-xs text-slate-400 bg-slate-900/50 rounded-lg px-3 py-2.5 border border-slate-700/40 leading-relaxed">
                🧠 {item.reasoning}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Rotating color palette for BOM component nodes (no product_type in BomLine)
const NODE_PALETTE = [
  { bg: '#1e2c1a', border: '#22c55e', glow: 'rgba(34,197,94,0.25)' },
  { bg: '#1e1a2c', border: '#a855f7', glow: 'rgba(168,85,247,0.25)' },
  { bg: '#1a2237', border: '#3b82f6', glow: 'rgba(59,130,246,0.25)' },
  { bg: '#2c1a1a', border: '#f97316', glow: 'rgba(249,115,22,0.25)' },
  { bg: '#1a2c2c', border: '#06b6d4', glow: 'rgba(6,182,212,0.25)' },
  { bg: '#2c2c1a', border: '#eab308', glow: 'rgba(234,179,8,0.25)' },
];

function buildBomGraph(bom: Bom): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const productName = bom?.finished_product?.name || 'Unknown';

  nodes.push({
    id: 'root',
    position: { x: 0, y: 0 },
    data: { label: productName },
    style: {
      background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
      color: '#e2e8f0',
      border: '2px solid #06b6d4',
      borderRadius: '16px',
      padding: '14px 28px',
      fontWeight: '700',
      fontSize: '14px',
      boxShadow: '0 0 24px rgba(6,182,212,0.4), 0 4px 16px rgba(0,0,0,0.6)',
      width: 220,
      textAlign: 'center',
      letterSpacing: '0.02em',
    },
    type: 'default',
  });

  const lines = bom?.bom_lines || [];
  const count = lines.length;
  const nodeW = 190;
  const gapX = 48;
  const totalW = count * nodeW + (count - 1) * gapX;
  const startX = -(totalW / 2) + nodeW / 2;

  lines.forEach((line, i) => {
    const nodeId = `comp-${line.id}`;
    const col = NODE_PALETTE[i % NODE_PALETTE.length];

    nodes.push({
      id: nodeId,
      position: { x: startX + i * (nodeW + gapX), y: 220 },
      data: {
        label: `${line.component_product_name}\n× ${Number(line.qty_per_unit).toFixed(1)}`,
      },
      style: {
        background: col.bg,
        color: '#cbd5e1',
        border: `1.5px solid ${col.border}`,
        borderRadius: '12px',
        padding: '10px 16px',
        fontSize: '12px',
        fontWeight: '600',
        width: nodeW,
        textAlign: 'center',
        boxShadow: `0 0 14px ${col.glow}, 0 2px 8px rgba(0,0,0,0.5)`,
        whiteSpace: 'pre-wrap',
        lineHeight: '1.5',
      },
    });

    edges.push({
      id: `e-root-${nodeId}`,
      source: 'root',
      target: nodeId,
      animated: true,
      type: 'smoothstep',
      style: { stroke: col.border, strokeWidth: 2, strokeDasharray: '6 3' },
      markerEnd: { type: MarkerType.ArrowClosed, color: col.border, width: 14, height: 14 },
    });
  });

  return { nodes, edges };
}

export default function AiInsights() {
  const [forecasts, setForecasts] = useState<ForecastItem[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [overallTrend, setOverallTrend] = useState('');
  const [computedAt, setComputedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [bomName, setBomName] = useState('Loading...');
  const [bomList, setBomList] = useState<BomOption[]>([]);
  const [selectedBomIdx, setSelectedBomIdx] = useState(0);

  async function loadBom(idx: number, list: BomOption[]) {
    if (!list.length) { setBomName('No BoMs'); return; }
    const bom = await bomsApi.get(list[idx].id);
    setBomName(bom?.finished_product?.name || list[idx].reference);
    const { nodes: n, edges: e } = buildBomGraph(bom);
    setNodes(n);
    setEdges(e);
  }

  useEffect(() => {
    async function load() {
      try {
        const [fd, ad, bl] = await Promise.all([
          aiApi.getDemandForecast(),
          aiApi.getAnomalies(),
          bomsApi.listBrief(),
        ]);
        setForecasts(fd.forecasts || []);
        setAnomalies(ad.anomalies || []);
        setOverallTrend(fd.overall_trend || '');
        setComputedAt(fd.computed_at || '');
        const bomOptions: BomOption[] = bl || [];
        setBomList(bomOptions);
        await loadBom(0, bomOptions);
      } catch (err: any) {
        setError(err.message || 'Failed to load AI insights');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleBomChange = async (idx: number) => {
    setSelectedBomIdx(idx);
    setNodes([]);
    setEdges([]);
    await loadBom(idx, bomList);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="relative">
          <div className="h-14 w-14 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl">🧠</span>
          </div>
        </div>
        <p className="text-slate-400 text-sm">Running AI analysis on live data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center py-20 gap-3">
        <span className="text-4xl">⚠️</span>
        <p className="text-rose-400 font-semibold">{error}</p>
      </div>
    );
  }

  const highRisk = forecasts.filter(f => f.shortage_probability > 0.6).length;
  const highAnomalies = anomalies.filter(a => a.severity === 'High').length;

  return (
    <div className="max-w-7xl space-y-8">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-900">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 via-transparent to-cyan-600/10 pointer-events-none" />
        <div className="relative p-6 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-cyan-400 to-purple-400 leading-tight">
              NeoTorque AI Insights
            </h1>
            <p className="mt-1.5 text-slate-400 text-sm max-w-xl">
              Real-time analysis of live inventory, sales demand, production orders, and supply chain health.
            </p>
            {overallTrend && (
              <p className="mt-3 text-slate-300 text-sm font-medium bg-slate-800/60 rounded-lg px-4 py-2 border border-slate-700/50 inline-block">
                {overallTrend}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 md:items-end">
            <div className="flex gap-3">
              <div className="text-center px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <p className="text-2xl font-bold text-rose-400">{highRisk}</p>
                <p className="text-xs text-slate-500">Critical SKUs</p>
              </div>
              <div className="text-center px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-2xl font-bold text-amber-400">{highAnomalies}</p>
                <p className="text-xs text-slate-500">High Anomalies</p>
              </div>
              <div className="text-center px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                <p className="text-2xl font-bold text-indigo-400">{forecasts.length}</p>
                <p className="text-xs text-slate-500">Products Scanned</p>
              </div>
            </div>
            {computedAt && (
              <p className="text-xs text-slate-600">
                Last computed: {new Date(computedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Demand Forecasting + Anomalies ─────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Demand Forecasting */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 flex flex-col">
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              Demand Forecasting
            </h2>
            <span className="text-xs text-slate-500">{forecasts.length} products · live data</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[560px] custom-scrollbar">
            {forecasts.length === 0 ? (
              <p className="text-center text-slate-500 py-8">No product data available</p>
            ) : (
              forecasts.map((f, i) => <ForecastCard key={f.product_id} item={f} index={i} />)
            )}
          </div>
        </div>

        {/* Anomaly Detection */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 flex flex-col">
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              Anomaly Detection
            </h2>
            <span className="text-xs text-slate-500">{anomalies.length} signals detected</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[560px] custom-scrollbar">
            {anomalies.length === 0 ? (
              <p className="text-center text-slate-500 py-8">No anomalies detected</p>
            ) : (
              anomalies.map((a, i) => <AnomalyCard key={a.id} item={a} index={i} />)
            )}
          </div>
        </div>
      </div>

      {/* ── BOM Explosion Visualizer ────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
              Live BOM Explosion Visualizer
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Interactive component tree — pan, zoom, and explore</p>
          </div>
          <div className="flex items-center gap-3">
            {bomList.length > 1 && (
              <select
                value={selectedBomIdx}
                onChange={e => handleBomChange(Number(e.target.value))}
                className="text-xs rounded-lg border border-slate-700 bg-slate-800 text-slate-300 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                {bomList.map((b, i) => (
                  <option key={b.id} value={i}>{b.reference}</option>
                ))}
              </select>
            )}
            <div className="px-3 py-1.5 text-xs rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 font-medium">
              {bomName}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="px-6 py-3 flex flex-wrap gap-4 border-b border-slate-800/50 bg-slate-950/20">
          {[
            { color: '#22c55e', label: 'Raw Component' },
            { color: '#a855f7', label: 'Sub-Assembly' },
            { color: '#3b82f6', label: 'Finished Good' },
            { color: '#06b6d4', label: 'Finished Product (Root)' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: color, boxShadow: `0 0 6px ${color}60` }} />
              <span className="text-xs text-slate-500">{label}</span>
            </div>
          ))}
        </div>

        <div style={{ height: 440 }} className="w-full bg-slate-950 relative">
          {nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-3">📊</div>
                <p className="text-slate-500 text-sm">No BoM data to visualize</p>
              </div>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              attributionPosition="bottom-right"
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#1e293b" gap={28} size={1} />
              <Controls
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  gap: '2px',
                  padding: '4px',
                }}
              />
              <MiniMap
                nodeStrokeColor={(n: Node) => n.id === 'root' ? '#06b6d4' : '#475569'}
                nodeColor={(n: Node) => n.id === 'root' ? '#164e63' : '#1e293b'}
                maskColor="rgba(2, 6, 23, 0.7)"
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '10px',
                }}
              />
            </ReactFlow>
          )}
        </div>
      </div>
    </div>
  );
}
