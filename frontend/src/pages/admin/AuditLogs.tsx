import { useEffect, useState } from 'react';
import { auditLogsApi } from '../../api/audit';
import type { AuditLogItem } from '../../types/audit';
import { AUDIT_MODULES, AUDIT_ACTIONS, ACTION_COLORS } from '../../types/audit';

const PAGE_SIZE = 50;

export default function AuditLogs() {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    load();
  }, [moduleFilter, actionFilter, dateFrom, dateTo, page]);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await auditLogsApi.list({
        module: moduleFilter || undefined,
        action: actionFilter || undefined,
        user_name: userFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setItems(data.items);
      setTotalCount(data.total_count);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 403) {
        setError(
          `You don't have permission to view audit logs (Admin access required).${
            detail ? ` Server: ${detail}` : ''
          }`
        );
      } else if (status === 401) {
        setError('Session expired. Please log in again.');
      } else if (status) {
        setError(`Failed to load audit logs (HTTP ${status}${detail ? `: ${detail}` : ''})`);
      } else {
        setError(`Failed to load audit logs: ${err?.message || 'unknown error'}`);
      }
      setItems([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const resetFilters = () => {
    setModuleFilter('');
    setActionFilter('');
    setUserFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const formatTimestamp = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString();
  };

  // Build a human-readable change description
  const describeChange = (item: AuditLogItem) => {
    if (item.action === 'created') return `Created ${item.record_type}`;
    if (item.action === 'deleted') return `Deleted ${item.record_type}`;
    if (item.action === 'status_changed') {
      return `Status: ${item.old_value || '—'} → ${item.new_value || '—'}`;
    }
    if (item.action === 'updated' && item.field_changed) {
      return `${item.field_changed}: ${item.old_value ?? '—'} → ${item.new_value ?? '—'}`;
    }
    return `Updated ${item.record_type}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
          <p className="text-slate-400 text-sm mt-1">
            Read-only history of every change. {totalCount.toLocaleString()} entries match current filters.
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[10px] tracking-[0.2em] text-slate-500 uppercase mb-1">Total Logs</p>
          <p className="text-2xl font-bold text-white">{totalCount}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[10px] tracking-[0.2em] text-slate-500 uppercase mb-1">Create Actions</p>
          <p className="text-2xl font-bold text-emerald-400">{items.filter(i => i.action === 'created').length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[10px] tracking-[0.2em] text-slate-500 uppercase mb-1">Update Actions</p>
          <p className="text-2xl font-bold text-blue-400">{items.filter(i => i.action === 'updated').length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[10px] tracking-[0.2em] text-slate-500 uppercase mb-1">Delete Actions</p>
          <p className="text-2xl font-bold text-rose-400">{items.filter(i => i.action === 'deleted').length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] tracking-[0.2em] text-slate-500 uppercase mb-1.5">
              Module
            </label>
            <select
              value={moduleFilter}
              onChange={(e) => { setModuleFilter(e.target.value); setPage(1); }}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              <option value="">All</option>
              {AUDIT_MODULES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] tracking-[0.2em] text-slate-500 uppercase mb-1.5">
              User
            </label>
            <input
              type="text"
              placeholder="Search user..."
              value={userFilter}
              onChange={(e) => { setUserFilter(e.target.value); setPage(1); }}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>

          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] tracking-[0.2em] text-slate-500 uppercase mb-1.5">
              Action
            </label>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              <option value="">All</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>{a.replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[150px]">
            <label className="block text-[10px] tracking-[0.2em] text-slate-500 uppercase mb-1.5">
              From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>

          <div className="flex-1 min-w-[150px]">
            <label className="block text-[10px] tracking-[0.2em] text-slate-500 uppercase mb-1.5">
              To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>

          <button
            onClick={resetFilters}
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm hover:bg-slate-700"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Error / loading */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] tracking-[0.2em] text-slate-500 uppercase">
                <th className="text-left px-5 py-3 font-medium">Date & Time</th>
                <th className="text-left px-5 py-3 font-medium">User</th>
                <th className="text-left px-5 py-3 font-medium">Module</th>
                <th className="text-left px-5 py-3 font-medium">Record Type</th>
                <th className="text-left px-5 py-3 font-medium">Record ID</th>
                <th className="text-left px-5 py-3 font-medium">Action</th>
                <th className="text-left px-5 py-3 font-medium">Field Changed</th>
                <th className="text-left px-5 py-3 font-medium">Old Value</th>
                <th className="text-left px-5 py-3 font-medium">New Value</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                    No audit entries match these filters
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30"
                  >
                    <td className="px-5 py-3 text-slate-400 whitespace-nowrap">
                      {formatTimestamp(item.occurred_at)}
                    </td>
                    <td className="px-5 py-3 text-slate-200">{item.user_name || '—'}</td>
                    <td className="px-5 py-3 text-slate-300">{item.module}</td>
                    <td className="px-5 py-3 text-slate-400 font-mono text-xs">{item.record_type}</td>
                    <td className="px-5 py-3 text-slate-600 font-mono text-xs">{item.record_id.slice(0, 8)}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${ACTION_COLORS[item.action] || 'bg-slate-500/20 text-slate-300'}`}>
                        {item.action.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-300">{item.field_changed || '—'}</td>
                    <td className="px-5 py-3 text-slate-400">{item.old_value || '—'}</td>
                    <td className="px-5 py-3 text-slate-200">{item.new_value || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {totalCount > PAGE_SIZE && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 text-sm">
              <span className="text-slate-500">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
