import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AxiosError } from 'axios';
import AuthPageShell from '../../components/layout/AuthPageShell';

interface LoginPageProps {
  isAdminLogin?: boolean;
}

export default function Login({ isAdminLogin = false }: LoginPageProps) {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await login({ login_id: loginId, password });

      // Route based on is_system_admin from JWT payload
      // NOTE: This routing is purely a frontend decision based on the JWT.
      // The page the user came from (/login vs /login/admin) doesn't matter
      // for security - it's just different UI headings for the same endpoint.
      if (response.is_system_admin) {
        navigate('/admin', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      const axiosError = err as AxiosError<{ detail: string }>;
      // Backend returns "Invalid Login Id or Password" for both wrong id and wrong password
      setError(axiosError.response?.data?.detail || 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPageShell
      title={isAdminLogin ? 'Administrator Sign In' : 'DriveForge Motors'}
      subtitle={isAdminLogin ? 'Access the administration console' : 'System User Login'}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-2xl text-center">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="loginId" className="block text-sm font-medium text-slate-300">
            Login ID
          </label>
          <input
            id="loginId"
            type="text"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            className="w-full bg-slate-900/70 border border-slate-700/70 rounded-3xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400 transition-all"
            placeholder="Enter your Login ID"
            required
            autoComplete="username"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-medium text-slate-300">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-900/70 border border-slate-700/70 rounded-3xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400 transition-all"
            placeholder="Enter your password"
            required
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-3xl bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-3 text-base font-semibold text-white shadow-xl shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-3">
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Signing in...
            </span>
          ) : (
            'Sign In'
          )}
        </button>

        <div className="mt-6 space-y-4 text-center text-sm">
          <div className="flex justify-center items-center gap-2 text-slate-400">
            <Link to="/forget-password" className="text-cyan-300 hover:text-cyan-200 font-medium">
              Forget Password ?
            </Link>
            <span className="text-slate-600">|</span>
            <Link to="/signup" className="text-cyan-300 hover:text-cyan-200 font-medium">
              Sign Up
            </Link>
          </div>
          <div className="border-t border-slate-800/80 pt-4">
            {isAdminLogin ? (
              <Link to="/login" className="text-slate-400 hover:text-slate-200 font-semibold text-base transition-colors font-medium">
                Login as User
              </Link>
            ) : (
              <Link to="/login/admin" className="text-slate-400 hover:text-slate-200 font-semibold text-base transition-colors font-medium">
                Login as System Administrator
              </Link>
            )}
          </div>
        </div>
      </form>
    </AuthPageShell>
  );
}
