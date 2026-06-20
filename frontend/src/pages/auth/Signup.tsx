import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AxiosError } from 'axios';
import type { RoleType, ValidationErrorResponse } from '../../types/auth';
import AuthPageShell from '../../components/layout/AuthPageShell';

interface FormErrors {
  name?: string;
  login_id?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  role?: string;
}

// Password validation rules (must match backend exactly)
function validatePassword(password: string): string[] {
  const errors: string[] = [];

  if (password.length <= 8) {
    errors.push('Password must be more than 8 characters long');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain a lowercase letter');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter');
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push('Password must contain a special character');
  }

  return errors;
}

const ROLES: { value: RoleType; label: string }[] = [
  { value: 'sales', label: 'Sales' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'owner', label: 'Business Owner' },
];

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<RoleType | ''>('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inline validation on blur
  const validateField = (field: string, value: string) => {
    const newErrors = { ...errors };

    switch (field) {
      case 'name':
        if (!value.trim()) {
          newErrors.name = 'Name is required';
        } else {
          delete newErrors.name;
        }
        break;

      case 'login_id':
        if (value.length < 6 || value.length > 12) {
          newErrors.login_id = 'Login ID must be between 6 and 12 characters';
        } else {
          delete newErrors.login_id;
        }
        break;

      case 'email':
        if (!value.includes('@')) {
          newErrors.email = 'Please enter a valid email address';
        } else {
          delete newErrors.email;
        }
        break;

      case 'password':
        const passwordErrors = validatePassword(value);
        if (passwordErrors.length > 0) {
          newErrors.password = passwordErrors[0]; // Show first error only
        } else {
          delete newErrors.password;
        }
        // Also check confirm password if it has a value
        if (confirmPassword && value !== confirmPassword) {
          newErrors.confirmPassword = 'Passwords do not match';
        } else if (confirmPassword) {
          delete newErrors.confirmPassword;
        }
        break;

      case 'confirmPassword':
        if (value !== password) {
          newErrors.confirmPassword = 'Passwords do not match';
        } else {
          delete newErrors.confirmPassword;
        }
        break;

      case 'role':
        if (!value) {
          newErrors.role = 'Please select a role';
        } else {
          delete newErrors.role;
        }
        break;
    }

    setErrors(newErrors);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');

    // Final validation
    const finalErrors: FormErrors = {};

    if (!name.trim()) finalErrors.name = 'Name is required';
    if (loginId.length < 6 || loginId.length > 12) {
      finalErrors.login_id = 'Login ID must be between 6 and 12 characters';
    }
    if (!email.includes('@')) finalErrors.email = 'Please enter a valid email address';

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) finalErrors.password = passwordErrors[0];

    if (password !== confirmPassword) finalErrors.confirmPassword = 'Passwords do not match';
    if (!role) finalErrors.role = 'Please select a role';

    if (Object.keys(finalErrors).length > 0) {
      setErrors(finalErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      // NOTE: We do NOT send is_system_admin - it's not in SignupRequest
      // The server hardcodes it to false for public signup
      await signup({
        name,
        login_id: loginId,
        email,
        password,
        role: role as RoleType,
      });

      // Always routes to dashboard for signup (never admin)
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const axiosError = err as AxiosError<ValidationErrorResponse | { detail: string }>;

      if (axiosError.response?.status === 422 && Array.isArray(axiosError.response.data.detail)) {
        // Field-specific errors from backend
        const fieldErrors: FormErrors = {};
        for (const error of axiosError.response.data.detail) {
          fieldErrors[error.field as keyof FormErrors] = error.message;
        }
        setErrors(fieldErrors);
      } else if (axiosError.response?.data && 'detail' in axiosError.response.data) {
        setServerError(axiosError.response.data.detail as string);
      } else {
        setServerError('Signup failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPageShell title="Create Account" subtitle="Join NEOTORQUE ERP">
      <form onSubmit={handleSubmit} className="space-y-5">
        {serverError && (
          <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200 text-center">
            {serverError}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="name" className="block text-sm font-medium text-slate-300">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={(e) => validateField('name', e.target.value)}
              className={`w-full bg-slate-950/80 border border-slate-800/70 rounded-3xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 focus:border-cyan-400 transition-all ${
                errors.name ? 'border-red-500' : 'border-slate-800/70'
              }`}
              placeholder="John Doe"
            />
            {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="loginId" className="block text-sm font-medium text-slate-300">
              Login ID
            </label>
            <input
              id="loginId"
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              onBlur={(e) => validateField('login_id', e.target.value)}
              className={`w-full bg-slate-950/80 border border-slate-800/70 rounded-3xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 focus:border-cyan-400 transition-all ${
                errors.login_id ? 'border-red-500' : 'border-slate-800/70'
              }`}
              placeholder="6-12 characters"
              maxLength={12}
            />
            {errors.login_id && <p className="text-xs text-red-400 mt-1">{errors.login_id}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-slate-300">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={(e) => validateField('email', e.target.value)}
              className={`w-full bg-slate-950/80 border border-slate-800/70 rounded-3xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 focus:border-cyan-400 transition-all ${
                errors.email ? 'border-red-500' : 'border-slate-800/70'
              }`}
              placeholder="john@example.com"
            />
            {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="role" className="block text-sm font-medium text-slate-300">
              Department / Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value as RoleType);
                validateField('role', e.target.value);
              }}
              className={`w-full bg-slate-950/80 border border-slate-800/70 rounded-3xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 focus:border-cyan-400 transition-all ${
                errors.role ? 'border-red-500' : 'border-slate-800/70'
              }`}
            >
              <option value="">Select your role</option>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            {errors.role && <p className="text-xs text-red-400 mt-1">{errors.role}</p>}
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
              onBlur={(e) => validateField('password', e.target.value)}
              className={`w-full bg-slate-950/80 border border-slate-800/70 rounded-3xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 focus:border-cyan-400 transition-all ${
                errors.password ? 'border-red-500' : 'border-slate-800/70'
              }`}
              placeholder="Min 9 chars, upper, lower, special"
              autoComplete="new-password"
            />
            {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={(e) => validateField('confirmPassword', e.target.value)}
              className={`w-full bg-slate-950/80 border border-slate-800/70 rounded-3xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 focus:border-cyan-400 transition-all ${
                errors.confirmPassword ? 'border-red-500' : 'border-slate-800/70'
              }`}
              placeholder="Re-enter your password"
              autoComplete="new-password"
            />
            {errors.confirmPassword && <p className="text-xs text-red-400 mt-1">{errors.confirmPassword}</p>}
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-3xl bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-3 text-base font-semibold text-white shadow-xl shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-3">
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Creating account...
            </span>
          ) : (
            'Create Account'
          )}
        </button>

        <div className="text-center text-sm text-slate-400">
          <p>
            Already have an account?{' '}
            <Link to="/login" className="text-cyan-300 hover:text-cyan-200">
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </AuthPageShell>
  );
}
