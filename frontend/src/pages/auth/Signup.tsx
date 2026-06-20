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

function validatePassword(password: string): string[] {
  const errors: string[] = [];
  if (password.length <= 8) errors.push('Password must be more than 8 characters long');
  if (!/[a-z]/.test(password)) errors.push('Password must contain a lowercase letter');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain an uppercase letter');
  if (!/[^a-zA-Z0-9]/.test(password)) errors.push('Password must contain a special character');
  return errors;
}

interface RoleCard {
  value: RoleType;
  label: string;
  subtitle: string;
  description: string;
  icon: string;
  accent: string;
  accentBg: string;
  modules: string[];
}

const ROLE_CARDS: RoleCard[] = [
  {
    value: 'sales',
    label: 'Sales Executive',
    subtitle: 'Sales Department',
    description: 'Create and manage customer orders for Sedan, SUV, and Hatchback models. Track deliveries for fleet customers like Zoom Car, Ola, and Meru Cabs.',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
    accent: 'text-cyan-400',
    accentBg: 'bg-cyan-500/10 border-cyan-500/30',
    modules: ['Sales Orders', 'Customers', 'Products'],
  },
  {
    value: 'purchase',
    label: 'Procurement Officer',
    subtitle: 'Purchase Department',
    description: 'Source raw components from vendors like Bharat Forge, MRF Tyres, and Bosch India. Manage engine blocks, tyres, brake systems, and all raw assembly parts.',
    icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
    accent: 'text-orange-400',
    accentBg: 'bg-orange-500/10 border-orange-500/30',
    modules: ['Purchase Orders', 'Vendors', 'Products'],
  },
  {
    value: 'manufacturing',
    label: 'Production Engineer',
    subtitle: 'Manufacturing Department',
    description: 'Oversee CityDrive X1 assembly — from chassis fabrication and engine sub-assembly to road testing and final QC sign-off. 18 work orders per car.',
    icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
    accent: 'text-violet-400',
    accentBg: 'bg-violet-500/10 border-violet-500/30',
    modules: ['Manufacturing Orders', 'Bill of Materials', 'Products'],
  },
  {
    value: 'inventory',
    label: 'Inventory Controller',
    subtitle: 'Warehouse & Stock',
    description: 'Track on-hand stock of raw components — pistons, crankshafts, brake pads, wiring harnesses, tyres. Manage stock levels and batch numbers for recall management.',
    icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4',
    accent: 'text-emerald-400',
    accentBg: 'bg-emerald-500/10 border-emerald-500/30',
    modules: ['Inventory', 'Products', 'Stock Movements'],
  },
  {
    value: 'owner',
    label: 'Business Owner',
    subtitle: 'Executive / Management',
    description: 'Full visibility across all DriveForge operations — sales pipeline, production floor, procurement status, and inventory health. Access to the management dashboard.',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    accent: 'text-yellow-400',
    accentBg: 'bg-yellow-500/10 border-yellow-500/30',
    modules: ['All Modules', 'Dashboard', 'Reports'],
  },
];

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<'role' | 'details'>('role');
  const [selectedRole, setSelectedRole] = useState<RoleCard | null>(null);

  const [name, setName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = (field: string, value: string) => {
    const newErrors = { ...errors };
    switch (field) {
      case 'name':
        if (!value.trim()) newErrors.name = 'Name is required';
        else delete newErrors.name;
        break;
      case 'login_id':
        if (value.length < 6 || value.length > 12) newErrors.login_id = 'Login ID must be between 6 and 12 characters';
        else delete newErrors.login_id;
        break;
      case 'email':
        if (!value.includes('@')) newErrors.email = 'Please enter a valid email address';
        else delete newErrors.email;
        break;
      case 'password': {
        const pwErrors = validatePassword(value);
        if (pwErrors.length > 0) newErrors.password = pwErrors[0];
        else delete newErrors.password;
        if (confirmPassword && value !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
        else if (confirmPassword) delete newErrors.confirmPassword;
        break;
      }
      case 'confirmPassword':
        if (value !== password) newErrors.confirmPassword = 'Passwords do not match';
        else delete newErrors.confirmPassword;
        break;
    }
    setErrors(newErrors);
  };

  const handleSelectRole = (card: RoleCard) => {
    setSelectedRole(card);
    setStep('details');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');

    const finalErrors: FormErrors = {};
    if (!name.trim()) finalErrors.name = 'Name is required';
    if (loginId.length < 6 || loginId.length > 12) finalErrors.login_id = 'Login ID must be between 6 and 12 characters';
    if (!email.includes('@')) finalErrors.email = 'Please enter a valid email address';
    const pwErrors = validatePassword(password);
    if (pwErrors.length > 0) finalErrors.password = pwErrors[0];
    if (password !== confirmPassword) finalErrors.confirmPassword = 'Passwords do not match';

    if (Object.keys(finalErrors).length > 0) {
      setErrors(finalErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await signup({
        name,
        login_id: loginId,
        email,
        password,
        role: selectedRole!.value,
      });
      navigate('/dashboard', { replace: true });
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
        setServerError('Signup failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Step 1: Role Selection ---
  if (step === 'role') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-12">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-white font-bold text-lg tracking-tight">DriveForge ERP</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Join DriveForge Motors</h1>
          <p className="text-slate-400">Select your department to get started with the right tools</p>
        </div>

        {/* Role Cards Grid */}
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {ROLE_CARDS.map((card) => (
            <button
              key={card.value}
              onClick={() => handleSelectRole(card)}
              className={`text-left p-5 rounded-2xl border bg-slate-900 hover:bg-slate-800 transition-all duration-200 hover:scale-[1.02] hover:shadow-xl group ${card.accentBg}`}
            >
              {/* Icon */}
              <div className={`w-10 h-10 rounded-xl ${card.accentBg} flex items-center justify-center mb-4`}>
                <svg className={`w-5 h-5 ${card.accent}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={card.icon} />
                </svg>
              </div>

              {/* Title */}
              <div className="mb-1">
                <h3 className="text-white font-semibold text-sm">{card.label}</h3>
                <p className={`text-xs font-medium ${card.accent}`}>{card.subtitle}</p>
              </div>

              {/* Description */}
              <p className="text-slate-400 text-xs leading-relaxed mb-4">{card.description}</p>

              {/* Modules chips */}
              <div className="flex flex-wrap gap-1.5">
                {card.modules.map((m) => (
                  <span key={m} className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-xs group-hover:bg-slate-700">
                    {m}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>

        <p className="text-sm text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="text-cyan-300 hover:text-cyan-200">Sign in</Link>
        </p>
      </div>
    );
  }

  // --- Step 2: Details Form ---
  const accent = selectedRole!.accent;
  const accentRing = accent.replace('text-', 'focus:ring-').replace('400', '400/25');
  const accentBorder = accent.replace('text-', 'focus:border-');

  return (
    <AuthPageShell
      title={`${selectedRole!.label} Account`}
      subtitle={`${selectedRole!.subtitle} · DriveForge Motors`}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Role preview banner */}
        <div className={`rounded-2xl border p-3 flex items-center gap-3 ${selectedRole!.accentBg}`}>
          <div className={`w-8 h-8 rounded-lg ${selectedRole!.accentBg} flex items-center justify-center shrink-0`}>
            <svg className={`w-4 h-4 ${selectedRole!.accent}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={selectedRole!.icon} />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-semibold ${selectedRole!.accent}`}>{selectedRole!.label}</p>
            <p className="text-xs text-slate-400 truncate">Access: {selectedRole!.modules.join(', ')}</p>
          </div>
          <button
            type="button"
            onClick={() => setStep('role')}
            className="text-xs text-slate-500 hover:text-slate-300 shrink-0 underline"
          >
            Change
          </button>
        </div>

        {serverError && (
          <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200 text-center">
            {serverError}
          </div>
        )}

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label htmlFor="name" className="block text-sm font-medium text-slate-300">Full Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={(e) => validateField('name', e.target.value)}
              className={`w-full bg-slate-950/80 border rounded-3xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-all ${errors.name ? 'border-red-500' : 'border-slate-800/70'} ${accentRing} ${accentBorder}`}
              placeholder={selectedRole?.value === 'manufacturing' ? 'e.g. Rajan Kumar' : selectedRole?.value === 'sales' ? 'e.g. Priya Sharma' : 'Your full name'}
            />
            {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
          </div>

          {/* Login ID */}
          <div className="space-y-1.5">
            <label htmlFor="loginId" className="block text-sm font-medium text-slate-300">Login ID</label>
            <input
              id="loginId"
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              onBlur={(e) => validateField('login_id', e.target.value)}
              className={`w-full bg-slate-950/80 border rounded-3xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-all ${errors.login_id ? 'border-red-500' : 'border-slate-800/70'} ${accentRing} ${accentBorder}`}
              placeholder="6–12 characters"
              maxLength={12}
            />
            {errors.login_id && <p className="text-xs text-red-400 mt-1">{errors.login_id}</p>}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-slate-300">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={(e) => validateField('email', e.target.value)}
              className={`w-full bg-slate-950/80 border rounded-3xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-all ${errors.email ? 'border-red-500' : 'border-slate-800/70'} ${accentRing} ${accentBorder}`}
              placeholder={`yourname@driveforge.in`}
            />
            {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-slate-300">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={(e) => validateField('password', e.target.value)}
              className={`w-full bg-slate-950/80 border rounded-3xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-all ${errors.password ? 'border-red-500' : 'border-slate-800/70'} ${accentRing} ${accentBorder}`}
              placeholder="Min 9 chars, upper, lower, special"
              autoComplete="new-password"
            />
            {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password}</p>}
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={(e) => validateField('confirmPassword', e.target.value)}
              className={`w-full bg-slate-950/80 border rounded-3xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-all ${errors.confirmPassword ? 'border-red-500' : 'border-slate-800/70'} ${accentRing} ${accentBorder}`}
              placeholder="Re-enter your password"
              autoComplete="new-password"
            />
            {errors.confirmPassword && <p className="text-xs text-red-400 mt-1">{errors.confirmPassword}</p>}
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full rounded-3xl px-5 py-3 text-base font-semibold text-white shadow-xl transition hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed ${
            selectedRole?.value === 'sales' ? 'bg-gradient-to-r from-cyan-500 to-blue-500 shadow-cyan-500/20' :
            selectedRole?.value === 'purchase' ? 'bg-gradient-to-r from-orange-500 to-amber-500 shadow-orange-500/20' :
            selectedRole?.value === 'manufacturing' ? 'bg-gradient-to-r from-violet-500 to-purple-600 shadow-violet-500/20' :
            selectedRole?.value === 'inventory' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-500/20' :
            'bg-gradient-to-r from-yellow-500 to-orange-500 shadow-yellow-500/20'
          }`}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-3">
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Creating account...
            </span>
          ) : (
            `Create ${selectedRole?.label} Account`
          )}
        </button>

        <div className="text-center text-sm text-slate-400">
          <p>
            Already have an account?{' '}
            <Link to="/login" className="text-cyan-300 hover:text-cyan-200">Sign in</Link>
          </p>
        </div>
      </form>
    </AuthPageShell>
  );
}
