import { useEffect, useState } from 'react';
import { aiApi } from '../../api/ai';

export default function AiInsights() {
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [forecastData, anomalyData] = await Promise.all([
          aiApi.getDemandForecast(),
          aiApi.getAnomalies()
        ]);
        setForecasts(forecastData.forecasts || []);
        setAnomalies(anomalyData.anomalies || []);
      } catch (err) {
        console.error('Failed to load AI insights', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">DriveForge AI Insights</h1>
        <p className="mt-2 text-slate-400">Intelligent forecasting, anomaly detection, and advanced visualizations.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Demand Forecasting */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg className="w-24 h-24 text-indigo-500" fill="currentColor" viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" /></svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            Demand Forecasting
          </h2>
          <div className="space-y-4 relative z-10">
            {forecasts.map((f, i) => (
              <div key={i} className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-slate-200">{f.product_name}</h3>
                  <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${f.shortage_probability > 0.8 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                    {(f.shortage_probability * 100).toFixed(0)}% Shortage Risk
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                  <div>
                    <p className="text-slate-500">Current Stock</p>
                    <p className="font-medium text-slate-300">{f.current_stock}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Predicted Demand (30d)</p>
                    <p className="font-medium text-slate-300">{f.predicted_demand_30d}</p>
                  </div>
                </div>
                <div className="text-xs text-indigo-300 bg-indigo-500/10 p-2 rounded-lg border border-indigo-500/20">
                  ⚡ AI Recommendation: {f.recommendation}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Anomaly Detection */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg className="w-24 h-24 text-rose-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L1 21h22M12 6l7.5 13h-15M11 10h2v5h-2m0 2h2v2h-2" /></svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            Anomaly Detection
          </h2>
          <div className="space-y-4 relative z-10">
            {anomalies.map((a, i) => (
              <div key={i} className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-slate-200">{a.type} Anomaly</h3>
                  <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${a.severity === 'High' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                    {a.severity} Severity
                  </span>
                </div>
                <p className="text-sm text-slate-400 mb-3">{a.description}</p>
                <div className="flex gap-2">
                  {a.affected_modules.map((m: string) => (
                    <span key={m} className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider bg-slate-700 text-slate-300 rounded">
                      Module: {m}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live BOM Explosion Animation */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl overflow-hidden">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
          Live BOM Explosion Visualizer
        </h2>
        <div className="h-80 w-full relative flex items-center justify-center bg-slate-950 rounded-xl border border-slate-800 overflow-hidden perspective-1000">
          
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at center, #06b6d4 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
          
          {/* Animated SVG Connections */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ strokeDasharray: '4 4' }}>
            <line x1="50%" y1="20%" x2="30%" y2="60%" stroke="#06b6d4" strokeWidth="2" className="animate-[dash_3s_linear_infinite] opacity-50" />
            <line x1="50%" y1="20%" x2="50%" y2="60%" stroke="#06b6d4" strokeWidth="2" className="animate-[dash_3s_linear_infinite] opacity-50" />
            <line x1="50%" y1="20%" x2="70%" y2="60%" stroke="#06b6d4" strokeWidth="2" className="animate-[dash_3s_linear_infinite] opacity-50" />
            
            <line x1="30%" y1="60%" x2="20%" y2="85%" stroke="#8b5cf6" strokeWidth="2" className="animate-[dash_3s_linear_infinite] opacity-30" />
            <line x1="30%" y1="60%" x2="40%" y2="85%" stroke="#8b5cf6" strokeWidth="2" className="animate-[dash_3s_linear_infinite] opacity-30" />
            <line x1="70%" y1="60%" x2="60%" y2="85%" stroke="#8b5cf6" strokeWidth="2" className="animate-[dash_3s_linear_infinite] opacity-30" />
            <line x1="70%" y1="60%" x2="80%" y2="85%" stroke="#8b5cf6" strokeWidth="2" className="animate-[dash_3s_linear_infinite] opacity-30" />
          </svg>

          <style>{`
            @keyframes dash {
              to { stroke-dashoffset: -20; }
            }
            .bom-node {
              transition: all 0.3s ease;
            }
            .bom-node:hover {
              transform: scale(1.1) translateY(-5px);
              box-shadow: 0 10px 25px -5px rgba(6, 182, 212, 0.4);
            }
          `}</style>

          {/* Root Node */}
          <div className="absolute top-[15%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bom-node">
            <div className="px-6 py-3 bg-gradient-to-br from-cyan-600 to-blue-600 rounded-xl border border-cyan-400 text-white font-bold shadow-lg shadow-cyan-900/50">
              Sedan Vehicle X
            </div>
          </div>

          {/* Level 1 Nodes */}
          <div className="absolute top-[60%] left-[30%] -translate-x-1/2 -translate-y-1/2 z-10 bom-node">
            <div className="px-4 py-2 bg-slate-800 rounded-lg border border-cyan-500/50 text-slate-200 text-sm font-medium">
              Chassis Sub-Assembly
            </div>
          </div>
          <div className="absolute top-[60%] left-[50%] -translate-x-1/2 -translate-y-1/2 z-10 bom-node">
            <div className="px-4 py-2 bg-slate-800 rounded-lg border border-cyan-500/50 text-slate-200 text-sm font-medium">
              V8 Engine Block
            </div>
          </div>
          <div className="absolute top-[60%] left-[70%] -translate-x-1/2 -translate-y-1/2 z-10 bom-node">
            <div className="px-4 py-2 bg-slate-800 rounded-lg border border-cyan-500/50 text-slate-200 text-sm font-medium">
              Interior Cabin
            </div>
          </div>

          {/* Level 2 Nodes */}
          <div className="absolute top-[85%] left-[20%] -translate-x-1/2 -translate-y-1/2 z-10 bom-node">
            <div className="px-3 py-1 bg-slate-900 rounded border border-purple-500/30 text-slate-400 text-xs">
              Steel Frame
            </div>
          </div>
          <div className="absolute top-[85%] left-[40%] -translate-x-1/2 -translate-y-1/2 z-10 bom-node">
            <div className="px-3 py-1 bg-slate-900 rounded border border-purple-500/30 text-slate-400 text-xs">
              Axle Set
            </div>
          </div>
          <div className="absolute top-[85%] left-[60%] -translate-x-1/2 -translate-y-1/2 z-10 bom-node">
            <div className="px-3 py-1 bg-slate-900 rounded border border-purple-500/30 text-slate-400 text-xs">
              Premium Seats
            </div>
          </div>
          <div className="absolute top-[85%] left-[80%] -translate-x-1/2 -translate-y-1/2 z-10 bom-node">
            <div className="px-3 py-1 bg-slate-900 rounded border border-purple-500/30 text-slate-400 text-xs">
              Dashboard UI
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
