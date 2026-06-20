import { useState, useEffect } from 'react';
import { usersApi } from '../../api/users';
import type { User, RoleType } from '../../types/auth';

const ROLES: { value: RoleType; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'sales', label: 'Sales' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'inventory', label: 'Inventory' },
];

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [updatedUserId, setUpdatedUserId] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await usersApi.list();
      setUsers(data);
      setError('');
    } catch (err: any) {
      setError('Failed to load users. Make sure you are logged in as a System Administrator.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    const userToUpdate = users.find((u) => u.id === userId);
    if (!userToUpdate) return;

    // Validate: non-admin users must have a role
    if (!userToUpdate.is_system_admin && !newRole) {
      setError('Role is required for non-admin users');
      return;
    }

    try {
      setError('');
      setSuccessMsg('');
      setUpdatedUserId(null);

      const parsedRole = newRole ? (newRole as RoleType) : null;
      await usersApi.update(userId, { role: parsedRole });

      // Update state
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: parsedRole } : u))
      );

      // Visual feedback
      setUpdatedUserId(userId);
      setSuccessMsg(`Role for ${userToUpdate.name} successfully updated.`);
      setTimeout(() => {
        setUpdatedUserId(null);
      }, 1500);
    } catch (err: any) {
      const apiError = err.response?.data?.detail;
      if (Array.isArray(apiError)) {
        setError(apiError.map((e) => e.message).join(', '));
      } else {
        setError(apiError || 'Failed to update user role');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-slate-400 text-sm mt-1">Manage system users and assign roles</p>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm transition-all duration-300">
          ⚠️ {error}
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm transition-all duration-300">
          ✅ {successMsg}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 text-left bg-slate-950/20">
                  <th className="px-6 py-4 text-sm font-semibold text-slate-400">Name</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-400">Login ID</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-400">Email</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-400">Current Role</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-400">System Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 text-sm">
                      No users found
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const isHighlighted = updatedUserId === u.id;
                    return (
                      <tr
                        key={u.id}
                        className={`transition-colors duration-500 ${
                          isHighlighted ? 'bg-emerald-500/10' : 'hover:bg-slate-800/20'
                        }`}
                      >
                        <td className="px-6 py-4 text-sm font-medium text-white">{u.name}</td>
                        <td className="px-6 py-4 text-sm text-slate-300 font-mono">{u.login_id}</td>
                        <td className="px-6 py-4 text-sm text-slate-300">{u.email}</td>
                        <td className="px-6 py-4 text-sm">
                          <select
                            value={u.role || ''}
                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:bg-slate-750 transition-colors cursor-pointer"
                          >
                            {u.is_system_admin && <option value="">No Role</option>}
                            {ROLES.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {u.is_system_admin ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              Admin
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400">
                              No
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
