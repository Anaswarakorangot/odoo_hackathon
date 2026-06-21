import { useState, useEffect } from 'react';
import { settingsApi, type UserSettingsResponse, type UserSettings } from '../../api/settings';
import { apiClient } from '../../api/client';

export default function Settings() {
  const [settings, setSettings] = useState<UserSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');


  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await settingsApi.get();
        setSettings(data);
      } catch (err: any) {
        setError('Failed to load settings.');
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleUpdate = async (updates: Partial<UserSettings>) => {
    if (!settings) return;
    try {
      setSaving(true);
      setError('');
      setSuccessMsg('');
      const updated = await settingsApi.update(updates);
      setSettings(updated);
      
      if (updates.theme !== undefined) {
        if (updates.theme === 'light') {
          document.documentElement.classList.add('light-mode');
        } else {
          document.documentElement.classList.remove('light-mode');
        }
      }

      setSuccessMsg('Settings saved successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    try {
      setSaving(true);
      setPasswordError('');
      await apiClient.put('/users/me/password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      setSuccessMsg('Password changed successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
      setShowPasswordChange(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      if (err.response?.data?.detail) {
        if (Array.isArray(err.response.data.detail)) {
          setPasswordError(err.response.data.detail[0].message);
        } else {
          setPasswordError(err.response.data.detail);
        }
      } else {
        setPasswordError('Failed to change password');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (!settings) {
    if (error) {
      return (
        <div className="max-w-4xl mx-auto mt-12">
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
            ⚠️ {error}
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">Manage your application preferences and behavior.</p>
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

      {/* General Settings */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <h2 className="font-semibold text-slate-200">General</h2>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Default Landing Module</label>
              <select
                value={settings.default_landing_module || ''}
                onChange={(e) => handleUpdate({ default_landing_module: e.target.value || null })}
                disabled={saving}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="">System Default (Dashboard)</option>
                {settings.available_landing_modules.filter(m => m !== 'Dashboard').map((mod) => (
                  <option key={mod} value={mod}>{mod}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Default List View</label>
              <select
                value={settings.default_list_view}
                onChange={(e) => handleUpdate({ default_list_view: e.target.value as 'table' | 'kanban' })}
                disabled={saving}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="table">Table View</option>
                <option value="kanban">Kanban Board</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Rows Per Page</label>
              <select
                value={settings.rows_per_page}
                onChange={(e) => handleUpdate({ rows_per_page: parseInt(e.target.value) })}
                disabled={saving}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Theme</label>
              <select
                value={settings.theme}
                onChange={(e) => handleUpdate({ theme: e.target.value as 'system' | 'light' | 'dark' })}
                disabled={saving}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="system">System Default</option>
                <option value="light">Light Mode</option>
                <option value="dark">Dark Mode</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Account */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <h2 className="font-semibold text-slate-200">Account</h2>
        </div>
        <div className="p-6">
          {!showPasswordChange ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-200">Password</p>
                <p className="text-sm text-slate-400">Change your password to secure your account.</p>
              </div>
              <button
                onClick={() => setShowPasswordChange(true)}
                className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
              >
                Change Password
              </button>
            </div>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>
              
              {passwordError && (
                <p className="text-sm text-red-400">{passwordError}</p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordChange(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-500 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Update Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
