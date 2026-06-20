import { useState, useEffect } from 'react';
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000/api',
});

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token) {
      api.get('/users/me', {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => setUser(res.data))
        .catch(() => {
          setToken(null);
          localStorage.removeItem('token');
        });
    }
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);
      
      const res = await api.post('/auth/login', formData);
      setToken(res.data.access_token);
      localStorage.setItem('token', res.data.access_token);
      setError('');
    } catch (err) {
      setError('Login failed. Please check credentials.');
    }
  };

  const handleRegister = async () => {
    try {
      await api.post('/users/', { email, password });
      handleLogin(new Event('submit') as any);
    } catch (err) {
      setError('Registration failed.');
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm">
        <div className="p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              {user ? 'Welcome Back!' : 'Get Started'}
            </h1>
            <p className="text-slate-400 mt-2 text-sm">
              {user ? 'You are successfully authenticated.' : 'Sign in to access your account'}
            </p>
          </div>

          {user ? (
            <div className="space-y-6">
              <div className="p-4 bg-slate-800/50 border border-slate-700/50 rounded-xl flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-500 to-emerald-500 flex items-center justify-center text-xl font-bold text-white shadow-lg">
                  {user.email.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm text-slate-400">Logged in as</p>
                  <p className="font-medium text-slate-200">{user.email}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full py-3 px-4 rounded-xl font-medium text-white bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-400 hover:to-pink-400 transition-all duration-300 shadow-lg shadow-red-500/25 active:scale-[0.98]"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-5">
              {error && (
                <div className="p-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg text-center">
                  {error}
                </div>
              )}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-400 px-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  placeholder="name@example.com"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-400 px-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="pt-2 gap-3 flex flex-col sm:flex-row">
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 rounded-xl font-medium text-white bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 transition-all duration-300 shadow-lg shadow-blue-500/25 active:scale-[0.98]"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={handleRegister}
                  className="flex-1 py-3 px-4 rounded-xl font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all duration-300 active:scale-[0.98]"
                >
                  Create Account
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
