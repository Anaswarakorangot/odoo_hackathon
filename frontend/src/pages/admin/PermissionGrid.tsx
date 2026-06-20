import { useEffect, useState } from 'react';
import { usersApi } from '../../api/users';
import type { PermissionEntry, PermissionUpdate, UserPermissionsResponse } from '../../api/users';

const MODULES = ['Sales', 'Purchase', 'Manufacturing', 'Product', 'BoM', 'AuditLog', 'Dashboard'];
const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'production_entry', 'edit_bom'];

interface Props {
  userId: string;
  isSystemAdmin: boolean;
}

export default function PermissionGrid({ userId, isSystemAdmin }: Props) {
  const [data, setData] = useState<UserPermissionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  // Pending edits not yet flushed
  const [pending, setPending] = useState<Record<string, PermissionUpdate>>({});

  useEffect(() => {
    load();
    setPending({});
  }, [userId]);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const d = await usersApi.getPermissions(userId);
      setData(d);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403) {
        setError('Admin access required to view per-user permissions.');
      } else if (status === 404) {
        setError(
          'Permissions endpoint not found — backend needs a restart to pick up the new route.'
        );
      } else {
        setError(`Failed to load permissions${status ? ` (HTTP ${status})` : ''}`);
      }
    } finally {
      setLoading(false);
    }
  };

  if (isSystemAdmin) {
    return (
      <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 text-sm text-purple-200">
        System administrators bypass all permission checks. Overrides do not apply.
      </div>
    );
  }

  const cellKey = (module: string, action: string) => `${module}::${action}`;

  // Current "effective" entry for a cell, taking pending edits into account.
  const effective = (module: string, action: string): PermissionEntry | undefined => {
    const base = data?.permissions.find((p) => p.module === module && p.action === action);
    const pend = pending[cellKey(module, action)];
    if (!pend) return base;
    if (pend.allowed === null) {
      // Cleared override — show as role default, can't actually compute without re-fetch.
      // Display as "role" with last-known role default. Best effort: keep base.allowed.
      return base
        ? { module, action, allowed: base.source === 'override' ? base.allowed : base.allowed, source: 'role' }
        : undefined;
    }
    return { module, action, allowed: pend.allowed, source: 'override' };
  };

  const cycle = (module: string, action: string) => {
    const current = effective(module, action);
    const key = cellKey(module, action);
    const base = data?.permissions.find((p) => p.module === module && p.action === action);
    if (!current || !base) return;

    // Cycle:
    //   role default -> override(grant) -> override(deny) -> clear override
    let next: PermissionUpdate;
    if (current.source !== 'override') {
      // Currently using role default. Override with true.
      next = { module, action, allowed: true };
    } else if (current.allowed) {
      // Override grant -> override deny
      next = { module, action, allowed: false };
    } else {
      // Override deny -> clear
      next = { module, action, allowed: null };
    }
    setPending((p) => ({ ...p, [key]: next }));
  };

  const save = async () => {
    if (Object.keys(pending).length === 0) return;
    try {
      setSaving(true);
      setError('');
      setSavedMsg('');
      const updates = Object.values(pending);
      const fresh = await usersApi.updatePermissions(userId, updates);
      setData(fresh);
      setPending({});
      setSavedMsg('Permissions saved.');
      setTimeout(() => setSavedMsg(''), 2500);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] tracking-[0.2em] text-slate-500 uppercase">Permission Overrides</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Click a cell to grant, deny, or clear an override. Role default shown when no override is set.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving || Object.keys(pending).length === 0}
          className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 text-xs font-semibold tracking-[0.15em] uppercase hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : `Save ${Object.keys(pending).length || ''}`}
        </button>
      </div>

      {error && (
        <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          {error}
        </div>
      )}
      {savedMsg && (
        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
          {savedMsg}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-800/50 text-[9px] tracking-[0.15em] text-slate-500 uppercase">
              <th className="text-left px-3 py-2 font-medium">Module</th>
              {ACTIONS.map((a) => (
                <th key={a} className="text-center px-2 py-2 font-medium">
                  {a.replace('_', ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULES.map((module) => (
              <tr key={module} className="border-t border-slate-800/50">
                <td className="px-3 py-2 text-slate-300">{module}</td>
                {ACTIONS.map((action) => {
                  const cell = effective(module, action);
                  const isPending = !!pending[cellKey(module, action)];
                  if (!cell) {
                    return <td key={action} className="px-2 py-2 text-center text-slate-700">—</td>;
                  }
                  // Cell appearance
                  const isOverride = cell.source === 'override';
                  const allowed = cell.allowed;
                  const className = [
                    'w-full rounded-md px-1 py-1 text-[10px] font-semibold tracking-wider transition-colors',
                    isOverride
                      ? allowed
                        ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/50'
                        : 'bg-rose-500/20 text-rose-200 border border-rose-500/50'
                      : allowed
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                        : 'bg-slate-800 text-slate-500 border border-slate-700',
                    isPending ? 'ring-1 ring-amber-400/60' : '',
                  ].join(' ');
                  return (
                    <td key={action} className="px-1 py-1 text-center">
                      <button
                        onClick={() => cycle(module, action)}
                        title={`${cell.source} · ${allowed ? 'allowed' : 'denied'}${isPending ? ' (unsaved)' : ''}`}
                        className={className}
                      >
                        {isOverride ? (allowed ? 'GRANT' : 'DENY') : allowed ? 'role ✓' : 'role ✕'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
