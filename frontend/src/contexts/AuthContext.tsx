import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import type { User, LoginRequest, LoginResponse, SignupRequest, JWTPayload } from '../types/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSystemAdmin: boolean;
  login: (data: LoginRequest) => Promise<LoginResponse>;
  signup: (data: SignupRequest) => Promise<LoginResponse>;
  logout: () => void;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function decodeJWT(token: string): JWTPayload | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJWT(token);
  if (!payload) return true;
  return Date.now() >= payload.exp * 1000;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing token on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && !isTokenExpired(token)) {
      fetchCurrentUser();
    } else {
      localStorage.removeItem('token');
      setIsLoading(false);
    }
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const response = await apiClient.get<User>('/users/me');
      setUser(response.data);
    } catch {
      localStorage.removeItem('token');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/auth/login', data);
    const { access_token } = response.data;
    localStorage.setItem('token', access_token);
    await fetchCurrentUser();
    return response.data;
  };

  const signup = async (data: SignupRequest): Promise<LoginResponse> => {
    // NOTE: We explicitly do NOT include is_system_admin in the request.
    // The backend hardcodes it to false for public signup.
    const response = await apiClient.post<LoginResponse>('/auth/signup', {
      name: data.name,
      login_id: data.login_id,
      email: data.email,
      password: data.password,
      role: data.role,
      // is_system_admin is NOT sent - server ignores it anyway
    });
    const { access_token } = response.data;
    localStorage.setItem('token', access_token);
    await fetchCurrentUser();
    return response.data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    isSystemAdmin: user?.is_system_admin ?? false,
    login,
    signup,
    logout,
    updateUser: setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Hook that redirects based on auth state
export function useAuthRedirect() {
  const { isAuthenticated, isSystemAdmin, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    async function handleRedirect() {
      if (!isLoading && isAuthenticated) {
        if (isSystemAdmin) {
          navigate('/admin', { replace: true });
        } else {
          try {
            const { settingsApi } = await import('../api/settings');
            const settings = await settingsApi.get();
            const moduleMap: Record<string, string> = {
              'Dashboard': '/dashboard',
              'Sales': '/sales',
              'Purchase': '/purchase',
              'Manufacturing': '/manufacturing',
              'Inventory': '/inventory',
              'Product': '/products',
              'BoM': '/bom',
            };
            const path = settings.default_landing_module ? moduleMap[settings.default_landing_module] || '/dashboard' : '/dashboard';
            navigate(path, { replace: true });
          } catch {
            navigate('/dashboard', { replace: true });
          }
        }
      }
    }
    handleRedirect();
  }, [isAuthenticated, isSystemAdmin, isLoading, navigate]);
}
