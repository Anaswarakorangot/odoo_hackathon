import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import BrandMark from '../brand/BrandMark';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

// ─── All possible nav items ───────────────────────────────────────────────────
const ALL_ITEMS: Record<string, NavItem> = {
  dashboard: {
    label: 'Dashboard',
    path: '/dashboard',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  },
  sales: {
    label: 'Sales Orders',
    path: '/sales',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  },
  purchase: {
    label: 'Purchase Orders',
    path: '/purchase',
    icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
  },
  manufacturing: {
    label: 'Manufacturing',
    path: '/manufacturing',
    icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
  },
  products: {
    label: 'Products',
    path: '/products',
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  },
  bom: {
    label: 'Bill of Materials',
    path: '/bom',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  inventory: {
    label: 'Inventory',
    path: '/inventory',
    icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4',
  },
  ai: {
    label: 'AI Insights',
    path: '/ai-insights',
    icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  },
};

// ─── What each role sees (in order) ──────────────────────────────────────────
const ROLE_NAV: Record<string, string[]> = {
  // Sales: only their orders + finished vehicle catalog
  sales: ['dashboard', 'sales', 'products'],

  // Purchase: vendor orders + raw component catalog
  purchase: ['dashboard', 'purchase', 'products'],

  // Manufacturing: production orders + BOMs + product catalog
  manufacturing: ['dashboard', 'manufacturing', 'bom', 'products'],

  // Inventory: stock + product catalog
  inventory: ['dashboard', 'inventory', 'products'],

  // Owner: full visibility across everything
  owner: ['dashboard', 'sales', 'purchase', 'manufacturing', 'bom', 'products', 'inventory', 'ai'],
};

// ─── Role accent config ───────────────────────────────────────────────────────
const ROLE_META: Record<string, { label: string; activeClass: string; textColor: string }> = {
  sales:         { label: 'Sales',       activeClass: 'bg-cyan-500/10 text-cyan-400',    textColor: 'text-cyan-400' },
  purchase:      { label: 'Procurement', activeClass: 'bg-orange-500/10 text-orange-400', textColor: 'text-orange-400' },
  manufacturing: { label: 'Production',  activeClass: 'bg-violet-500/10 text-violet-400', textColor: 'text-violet-400' },
  inventory:     { label: 'Warehouse',   activeClass: 'bg-emerald-500/10 text-emerald-400', textColor: 'text-emerald-400' },
  owner:         { label: 'Management',  activeClass: 'bg-blue-500/10 text-blue-400',    textColor: 'text-yellow-400' },
};

const adminNavItems: NavItem[] = [
  { label: 'Admin Dashboard', path: '/admin',            icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
  { label: 'User Management', path: '/admin/users',      icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  { label: 'Permissions',     path: '/admin/permissions', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { label: 'Audit Logs',      path: '/admin/audit',      icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
];

export default function Sidebar() {
  const { isSystemAdmin, user } = useAuth();

  // ── Admin sidebar ─────────────────────────────────────────────────────────
  if (isSystemAdmin) {
    return (
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full">
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <BrandMark compact />
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <div className="px-4 mb-2">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Administration</h2>
          </div>
          <nav className="space-y-1 px-3">
            {adminNavItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/admin'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-purple-500/10 text-purple-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`
                }
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                </svg>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="p-4 border-t border-slate-800">
          <p className="text-xs text-slate-600 text-center">NEOTORQUE ERP v1.0</p>
        </div>
      </aside>
    );
  }

  // ── Regular user sidebar — role-filtered ──────────────────────────────────
  const role = user?.role || 'owner';
  const meta = ROLE_META[role] || ROLE_META.owner;
  const itemKeys = ROLE_NAV[role] || ROLE_NAV.owner;
  const items = itemKeys.map((k) => ALL_ITEMS[k]).filter(Boolean);

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full">
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <BrandMark compact />
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <div className="px-4 mb-2">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{meta.label}</h2>
        </div>
        <nav className="space-y-1 px-3">
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? meta.activeClass : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`
              }
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
              </svg>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* User pill at the bottom */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-slate-200">{user?.name?.[0]?.toUpperCase() ?? '?'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-300 truncate">{user?.name}</p>
            <p className={`text-xs capitalize font-semibold ${meta.textColor}`}>{meta.label}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
