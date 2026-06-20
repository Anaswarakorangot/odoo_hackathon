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
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Panel state
  const [panelData, setPanelData] = useState<Partial<User>>({});
  const [savingPanel, setSavingPanel] = useState(false);

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

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setPanelData({
      name: user.name,
      address: user.address || '',
      mobile_number: user.mobile_number || '',
      email: user.email,
      login_id: user.login_id,
      position: user.position || '',
      photo_url: user.photo_url || '',
      role: user.role,
    });
    setError('');
    setSuccessMsg('');
  };

  const handlePanelChange = (field: keyof User, value: any) => {
    setPanelData(prev => ({ ...prev, [field]: value }));
  };

  const saveDetails = async () => {
    if (!selectedUser) return;
    
    if (!selectedUser.is_system_admin && !panelData.role) {
      setError('Role is required for non-admin users');
      return;
    }

    try {
      setSavingPanel(true);
      setError('');
      setSuccessMsg('');

      const updated = await usersApi.update(selectedUser.id, {
        name: panelData.name,
        address: panelData.address,
        mobile_number: panelData.mobile_number,
        email: panelData.email,
        position: panelData.position,
        photo_url: panelData.photo_url,
        role: panelData.role as RoleType | null,
      });

      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setSelectedUser(updated);
      setSuccessMsg(`Details for ${updated.name} successfully updated.`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      const apiError = err.response?.data?.detail;
      if (Array.isArray(apiError)) {
        setError(apiError.map((e: any) => e.message).join(', '));
      } else {
        setError(apiError || 'Failed to update user details');
      }
    } finally {
      setSavingPanel(false);
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-slate-400 text-sm mt-1">Manage system users and assign roles</p>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm shrink-0">
          ⚠️ {error}
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm shrink-0">
          ✅ {successMsg}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex gap-6 flex-1 min-h-[500px]">
          {/* User List Panel */}
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
            <div className="p-4 border-b border-slate-800 bg-slate-900/50">
              <h2 className="text-sm font-semibold text-white tracking-wide uppercase">User List</h2>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 text-left bg-slate-950/20">
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Login ID</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-slate-500 text-sm">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const isSelected = selectedUser?.id === u.id;
                      return (
                        <tr
                          key={u.id}
                          onClick={() => handleSelectUser(u)}
                          className={`transition-colors duration-200 cursor-pointer ${
                            isSelected ? 'bg-cyan-500/10 hover:bg-cyan-500/15' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="px-6 py-4 text-sm font-medium text-white flex items-center gap-3">
                            {u.photo_url ? (
                              <img src={u.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 font-bold uppercase">
                                {u.name.charAt(0)}
                              </div>
                            )}
                            {u.name}
                            {u.is_system_admin && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-purple-500" title="System Admin"></span>}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-300 font-mono">{u.login_id}</td>
                          <td className="px-6 py-4 text-sm text-slate-300">
                            {u.role ? ROLES.find(r => r.value === u.role)?.label : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Details Panel */}
          {selectedUser && (
            <div className="w-[400px] bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col shrink-0">
              <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                <h2 className="text-sm font-semibold text-white tracking-wide uppercase">User Login Detail Management</h2>
                {selectedUser.is_system_admin && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-purple-500/20 text-purple-400 uppercase">Admin</span>
                )}
              </div>
              <div className="p-6 overflow-y-auto space-y-5 flex-1">
                
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                    {panelData.photo_url ? (
                       <img src={panelData.photo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-slate-500 text-xs text-center px-1">No Photo</span>
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider">Photo URL</label>
                    <input
                      type="text"
                      value={panelData.photo_url || ''}
                      onChange={(e) => handlePanelChange('photo_url', e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider">Name</label>
                    <input
                      type="text"
                      value={panelData.name || ''}
                      onChange={(e) => handlePanelChange('name', e.target.value)}
                      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider">Login ID</label>
                    <input
                      type="text"
                      value={panelData.login_id || ''}
                      disabled
                      className="w-full bg-slate-800/50 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider">Email</label>
                  <input
                    type="email"
                    value={panelData.email || ''}
                    onChange={(e) => handlePanelChange('email', e.target.value)}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider">Mobile Number</label>
                  <input
                    type="text"
                    value={panelData.mobile_number || ''}
                    onChange={(e) => handlePanelChange('mobile_number', e.target.value)}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider">Address</label>
                  <textarea
                    value={panelData.address || ''}
                    onChange={(e) => handlePanelChange('address', e.target.value)}
                    rows={2}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider">Position</label>
                    <input
                      type="text"
                      value={panelData.position || ''}
                      onChange={(e) => handlePanelChange('position', e.target.value)}
                      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider">Role</label>
                    <select
                      value={panelData.role || ''}
                      onChange={(e) => handlePanelChange('role', e.target.value)}
                      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 cursor-pointer"
                    >
                      {selectedUser.is_system_admin && <option value="">No Role</option>}
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

              </div>
              <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end">
                <button
                  onClick={saveDetails}
                  disabled={savingPanel}
                  className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-blue-400 disabled:opacity-50 transition-all shadow-lg shadow-cyan-500/20"
                >
                  {savingPanel ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
