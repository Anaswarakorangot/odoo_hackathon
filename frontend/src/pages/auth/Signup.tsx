import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AxiosError } from 'axios';
import type { RoleType, ValidationErrorResponse } from '../../types/auth';

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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-emerald-500 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Create Account</h1>
          <p className="text-slate-400 mt-1">Join DriveForge Motors ERP</p>
        </div>

        {/* Signup Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {serverError && (
              <div className="p-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg text-center">
                {serverError}
              </div>
            )}

            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-sm font-medium text-slate-400">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={(e) => validateField('name', e.target.value)}
                className={`w-full bg-slate-800/50 border rounded-xl px-4 py-3 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${
                  errors.name ? 'border-red-500' : 'border-slate-700 focus:border-blue-500'
                }`}
                placeholder="John Doe"
              />
              {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
            </div>

            {/* Login ID */}
            <div className="space-y-1.5">
              <label htmlFor="loginId" className="block text-sm font-medium text-slate-400">
                Login ID
              </label>
              <input
                id="loginId"
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                onBlur={(e) => validateField('login_id', e.target.value)}
                className={`w-full bg-slate-800/50 border rounded-xl px-4 py-3 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${
                  errors.login_id ? 'border-red-500' : 'border-slate-700 focus:border-blue-500'
                }`}
                placeholder="6-12 characters"
                maxLength={12}
              />
              {errors.login_id && <p className="text-xs text-red-400 mt-1">{errors.login_id}</p>}
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-slate-400">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => validateField('email', e.target.value)}
                className={`w-full bg-slate-800/50 border rounded-xl px-4 py-3 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${
                  errors.email ? 'border-red-500' : 'border-slate-700 focus:border-blue-500'
                }`}
                placeholder="john@example.com"
              />
              {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <label htmlFor="role" className="block text-sm font-medium text-slate-400">
                Department / Role
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as RoleType);
                  validateField('role', e.target.value);
                }}
                className={`w-full bg-slate-800/50 border rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${
                  errors.role ? 'border-red-500' : 'border-slate-700 focus:border-blue-500'
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

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-slate-400">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={(e) => validateField('password', e.target.value)}
                className={`w-full bg-slate-800/50 border rounded-xl px-4 py-3 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${
                  errors.password ? 'border-red-500' : 'border-slate-700 focus:border-blue-500'
                }`}
                placeholder="Min 9 chars, upper, lower, special"
                autoComplete="new-password"
              />
              {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password}</p>}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-400">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={(e) => validateField('confirmPassword', e.target.value)}
                className={`w-full bg-slate-800/50 border rounded-xl px-4 py-3 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${
                  errors.confirmPassword ? 'border-red-500' : 'border-slate-700 focus:border-blue-500'
                }`}
                placeholder="Re-enter your password"
                autoComplete="new-password"
              />
              {errors.confirmPassword && (
                <p className="text-xs text-red-400 mt-1">{errors.confirmPassword}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-xl font-medium text-white bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-blue-500/25 active:scale-[0.98] mt-2"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account...
                </span>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <p className="text-slate-400">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-400 hover:text-blue-300">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
