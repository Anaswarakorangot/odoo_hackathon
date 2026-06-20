import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { AxiosError } from 'axios';
import type { ValidationErrorResponse } from '../../types/auth';
import BrandMark from '../../components/brand/BrandMark';

interface FormErrors {
  login_id?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
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

export default function ForgetPassword() {
  const navigate = useNavigate();

  const [loginId, setLoginId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = (field: string, value: string) => {
    const newErrors = { ...errors };

    switch (field) {
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
          newErrors.password = passwordErrors[0];
        } else {
          delete newErrors.password;
        }
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
    }

    setErrors(newErrors);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    setSuccessMessage('');

    // Final validation
    const finalErrors: FormErrors = {};

    if (loginId.length < 6 || loginId.length > 12) {
      finalErrors.login_id = 'Login ID must be between 6 and 12 characters';
    }
    if (!email.includes('@')) {
      finalErrors.email = 'Please enter a valid email address';
    }

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      finalErrors.password = passwordErrors[0];
    }

    if (password !== confirmPassword) {
      finalErrors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(finalErrors).length > 0) {
      setErrors(finalErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      await apiClient.post('/auth/reset-password', {
        login_id: loginId,
        email: email,
        password: password,
      });

      setSuccessMessage('Password reset successfully! Redirecting to login...');
      setTimeout(() => {
        navigate('/login');
      }, 2500);
    } catch (err) {
      const axiosError = err as AxiosError<ValidationErrorResponse | { detail: string }>;

      if (axiosError.response?.status === 422 && Array.isArray(axiosError.response.data.detail)) {
        const fieldErrors: FormErrors = {};
        for (const error of axiosError.response.data.detail) {
          fieldErrors[error.field as keyof FormErrors] = error.message;
        }
        setErrors(fieldErrors);
      } else if (axiosError.response?.data && 'detail' in axiosError.response.data) {
        setServerError(axiosError.response.data.detail as string);
      } else {
        setServerError('Failed to reset password. Please verify your credentials and try again.');
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
          <div className="mb-4 flex justify-center">
            <BrandMark compact />
          </div>
          <h1 className="text-2xl font-bold text-white">Reset Password</h1>
          <p className="text-slate-400 mt-1">Recover your NEOTORQUE account</p>
        </div>

        {/* Reset Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          {successMessage ? (
            <div className="space-y-4 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 mb-2">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-slate-200 font-medium">{successMessage}</p>
              <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full animate-[loading_2.5s_ease-in-out_forwards]" style={{ width: '100%' }} />
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {serverError && (
                <div className="p-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg text-center">
                  {serverError}
                </div>
              )}

              {/* Login ID */}
              <div className="space-y-1.5">
                <label htmlFor="loginId" className="block text-sm font-medium text-slate-400">
                  Enter Login ID
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
                  placeholder="Your Login ID"
                  maxLength={12}
                  required
                />
                {errors.login_id && <p className="text-xs text-red-400 mt-1">{errors.login_id}</p>}
              </div>

              {/* Email Address */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-slate-400">
                  Enter Email ID
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
                  placeholder="Your Email ID"
                  required
                />
                {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
              </div>

              {/* New Password */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-slate-400">
                  Enter Password
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
                  required
                />
                {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password}</p>}
              </div>

              {/* Re-enter Password */}
              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-400">
                  Re-Enter Password
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
                  required
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-red-400 mt-1">{errors.confirmPassword}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl font-medium text-white bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-blue-500/25 active:scale-[0.98] mt-4"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Resetting...
                  </span>
                ) : (
                  'Reset Password'
                )}
              </button>
            </form>
          )}

          <div className="mt-6 text-center text-sm">
            <p className="text-slate-400">
              Remember your password?{' '}
              <Link to="/login" className="text-blue-400 hover:text-blue-300 font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
