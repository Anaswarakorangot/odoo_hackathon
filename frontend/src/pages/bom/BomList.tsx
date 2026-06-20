import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { bomsApi } from '../../api/manufacturing';
import type { BomListItem } from '../../types/manufacturing';

// Deterministic accent colour per BoM, so each card has its own top bar tint.
const ACCENTS = [
  'bg-cyan-400',
  'bg-amber-400',
  'bg-emerald-400',
  'bg-fuchsia-400',
  'bg-rose-400',
  'bg-indigo-400',
];
function accentFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

export default function BomList() {
  const navigate = useNavigate();
  const [boms, setBoms] = useState<BomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await bomsApi.list();
      setBoms(data);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 403) {
        setError("You don't have permission to view Bills of Materials.");
      } else if (status === 404) {
        setError(
          'BoM endpoint not found. The backend may not have been restarted since the BoM module was added — restart uvicorn and try again.'
        );
      } else if (status === 401) {
        setError('Session expired. Please log in again.');
      } else if (status) {
        setError(`Failed to load Bills of Materials (HTTP ${status}${detail ? `: ${detail}` : ''})`);
      } else {
        setError(`Failed to load Bills of Materials: ${err?.message || 'network error'}`);
      }
      setBoms([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string, reference: string) => {
    e.stopPropagation();
    if (!confirm(`Delete ${reference}?`)) return;
    try {
      await bomsApi.delete(id);
      load();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete BoM');
    }
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString();

  const filtered = boms.filter((b) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      b.reference.toLowerCase().includes(q) ||
      b.finished_product_name.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold tracking-[0.25em] text-cyan-300 uppercase">
          Production Library
        </p>
        <h1 className="text-2xl font-semibold text-white tracking-tight mt-1">
          Bills of Materials
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Define what components and operations make each product
        </p>
      </div>

      {/* New BoM CTA */}
      <button
        onClick={() => navigate('/bom/new')}
        className="w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-semibold tracking-[0.2em] uppercase bg-cyan-400 text-slate-950 hover:bg-cyan-300 transition-colors shadow-lg shadow-cyan-500/30"
      >
        + New BoM
      </button>

      {/* Search */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
        <div className="relative">
          <svg
            className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search BoMs..."
            className="w-full bg-slate-950/40 border border-slate-800 rounded-xl pl-11 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 && !error ? (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
          {boms.length === 0
            ? 'No Bills of Materials yet. Click + NEW BOM to create one.'
            : 'No BoMs match your search.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((bom) => (
            <div
              key={bom.id}
              onClick={() => navigate(`/bom/${bom.id}`)}
              className="relative bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden cursor-pointer hover:border-slate-700 transition-colors"
            >
              {/* Top accent bar */}
              <div className={`absolute top-0 left-0 right-0 h-[3px] ${accentFor(bom.id)}`} />

              <div className="p-5">
                {/* Reference label + status pill */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] tracking-[0.2em] text-slate-500 uppercase">
                    BoM #{bom.reference}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] tracking-[0.15em] uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    Active
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-white text-lg font-semibold tracking-tight mb-4 truncate">
                  {bom.finished_product_name}
                </h3>

                {/* Data rows */}
                <div className="space-y-2.5 mb-5">
                  <Row label="Components" value={`${bom.bom_lines_count}`} />
                  <Row label="Operations" value={`${bom.bom_operations_count}`} />
                  <Row label="Created" value={formatDate(bom.created_at)} />
                </div>

                {/* Action row */}
                <div className="flex items-center gap-2 pt-3 border-t border-slate-800">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/bom/${bom.id}`);
                    }}
                    className="flex-1 py-2 rounded-xl border border-cyan-500/40 text-cyan-300 text-xs font-semibold tracking-[0.25em] uppercase hover:bg-cyan-500/10 transition-colors"
                  >
                    View BoM
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, bom.id, bom.reference)}
                    className="px-3 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
                    aria-label="Delete BoM"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-200 font-medium">{value}</span>
    </div>
  );
}
