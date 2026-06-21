import { useEffect, useState } from 'react';
import { aiApi } from '../../api/ai';
import { bomsApi } from '../../api/manufacturing';
import { ReactFlow, Controls, Background, MiniMap } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Bom } from '../../types/manufacturing';

export default function AiInsights() {
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedBomName, setSelectedBomName] = useState<string>('Loading...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [forecastData, anomalyData, bomsList] = await Promise.all([
          aiApi.getDemandForecast(),
          aiApi.getAnomalies(),
          bomsApi.listBrief()
        ]);
        setForecasts(forecastData.forecasts || []);
        setAnomalies(anomalyData.anomalies || []);
        
        if (bomsList && bomsList.length > 0) {
          const fullBom = await bomsApi.get(bomsList[0].id);
          buildBomGraph(fullBom);
        } else {
          setSelectedBomName('No BoMs Found');
        }
      } catch (err: any) {
        console.error('Failed to load AI insights', err);
        setErrorMsg(err.message || 'Unknown error occurred');
        setSelectedBomName('Error Loading Data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const buildBomGraph = (bom: Bom) => {
    const productName = bom?.finished_product?.name || 'Unknown Product';
    setSelectedBomName(productName);
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Root node (Finished Product)
    newNodes.push({
      id: 'root',
      position: { x: 350, y: 50 },
      data: { label: productName },
      style: {
        background: 'linear-gradient(to bottom right, #0891b2, #2563eb)',
        color: 'white',
        border: '1px solid #22d3ee',
        borderRadius: '12px',
        padding: '12px 24px',
        fontWeight: 'bold',
        boxShadow: '0 10px 15px -3px rgba(8, 145, 178, 0.5)',
        width: 200,
        textAlign: 'center',
      }
    });

    // Component nodes
    const lines = bom?.bom_lines || [];
    const totalLines = lines.length;
    const nodeWidth = 200;
    const spacing = 40;
    const totalWidth = (totalLines * nodeWidth) + ((totalLines - 1) * spacing);
    const startX = 350 - (totalWidth / 2) + (nodeWidth / 2);

    lines.forEach((line, index) => {
      const nodeId = `comp-${line.id}`;
      
      newNodes.push({
        id: nodeId,
        position: { x: startX + (index * (nodeWidth + spacing)), y: 200 },
        data: { label: `${line.component_product_name}\n(Qty: ${line.qty_per_unit})` },
        style: {
          background: '#1e293b',
          color: '#e2e8f0',
          border: '1px solid #06b6d4',
          borderRadius: '8px',
          padding: '10px 16px',
          width: nodeWidth,
          textAlign: 'center',
        }
      });

      newEdges.push({
        id: `edge-root-${nodeId}`,
        source: 'root',
        target: nodeId,
        animated: true,
        style: { stroke: '#06b6d4', strokeWidth: 2 }
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  };

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
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">NeoTorque AI Insights</h1>
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

      {/* Live BOM Explosion Visualizer - Now with React Flow! */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
            Live BOM Explosion Visualizer
          </h2>
          <div className="text-sm text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20">
            Viewing: {selectedBomName}
          </div>
        </div>
        
        <div className="h-96 w-full relative flex items-center justify-center bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
          {errorMsg ? (
            <div className="text-rose-500 font-medium">Error: {errorMsg}</div>
          ) : nodes.length > 0 ? (
            <ReactFlow 
              nodes={nodes} 
              edges={edges}
              fitView
              attributionPosition="bottom-right"
              className="react-flow-dark"
            >
              <Background color="#334155" gap={24} />
              <Controls />
              <MiniMap 
                nodeStrokeColor={(n) => {
                  if (n.id === 'root') return '#06b6d4';
                  return '#475569';
                }}
                nodeColor={(n) => {
                  if (n.id === 'root') return '#0ea5e9';
                  return '#1e293b';
                }}
                maskColor="rgba(15, 23, 42, 0.7)"
              />
            </ReactFlow>
          ) : (
            <div className="text-slate-500">No BoM Data Available to Visualize</div>
          )}
        </div>
      </div>
    </div>
  );
}
