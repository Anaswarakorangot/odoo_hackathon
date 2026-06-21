import { useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { settingsApi } from '../../api/settings';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function AppShell() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (isAuthenticated) {
      settingsApi.get().then((settings) => {
        if (settings.theme === 'light') {
          document.documentElement.classList.add('light-mode');
        } else {
          document.documentElement.classList.remove('light-mode');
        }
      }).catch(console.error);
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <TopBar />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
