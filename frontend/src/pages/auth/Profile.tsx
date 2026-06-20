import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usersApi } from '../../api/users';
import type { User } from '../../types/auth';

export default function Profile() {
  const { user } = useAuth();
  const [panelData, setPanelData] = useState<Partial<User>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (user) {
      setPanelData({
        name: user.name,
        address: user.address || '',
        mobile_number: user.mobile_number || '',
        email: user.email,
        photo_url: user.photo_url || '',
      });
    }
  }, [user]);

  const handlePanelChange = (field: keyof User, value: any) => {
    setPanelData(prev => ({ ...prev, [field]: value }));
  };

  const saveDetails = async () => {
    if (!user) return;
    try {
      setSaving(true);
      setError('');
      setSuccessMsg('');

      // Update only allowed profile fields
      await usersApi.update(user.id, {
        name: panelData.name,
        address: panelData.address,
        mobile_number: panelData.mobile_number,
        email: panelData.email,
        photo_url: panelData.photo_url,
      });

      setSuccessMsg('Profile successfully updated. Please refresh if some details did not update immediately.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      const apiError = err.response?.data?.detail;
      if (Array.isArray(apiError)) {
        setError(apiError.map((e: any) => e.message).join(', '));
      } else {
        setError(apiError || 'Failed to update profile');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Profile</h1>
          <p className="text-slate-400 text-sm mt-1">Manage your personal information</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          ⚠️ {error}
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">
          ✅ {successMsg}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col overflow-hidden">
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
              {panelData.photo_url ? (
                 <img src={panelData.photo_url} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-slate-500 text-sm text-center px-2">No Photo</span>
              )}
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Photo URL</label>
              <input
                type="text"
                value={panelData.photo_url || ''}
                onChange={(e) => handlePanelChange('photo_url', e.target.value)}
                placeholder="https://..."
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Name</label>
              <input
                type="text"
                value={panelData.name || ''}
                onChange={(e) => handlePanelChange('name', e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Login ID</label>
              <input
                type="text"
                value={user.login_id}
                disabled
                className="w-full bg-slate-800/50 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={panelData.email || ''}
              onChange={(e) => handlePanelChange('email', e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Mobile Number</label>
            <input
              type="text"
              value={panelData.mobile_number || ''}
              onChange={(e) => handlePanelChange('mobile_number', e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Address</label>
            <textarea
              value={panelData.address || ''}
              onChange={(e) => handlePanelChange('address', e.target.value)}
              rows={3}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Position</label>
              <input
                type="text"
                value={user.position || '—'}
                disabled
                className="w-full bg-slate-800/50 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-500 cursor-not-allowed"
              />
              <p className="text-[10px] text-slate-500 mt-1">Readonly. Contact admin to change.</p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Role</label>
              <input
                type="text"
                value={user.is_system_admin ? 'System Admin' : (user.role || 'No Role')}
                disabled
                className="w-full bg-slate-800/50 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-500 cursor-not-allowed capitalize"
              />
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end">
          <button
            onClick={saveDetails}
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-blue-400 disabled:opacity-50 transition-all shadow-lg shadow-cyan-500/20"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
