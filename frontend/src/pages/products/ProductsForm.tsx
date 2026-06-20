import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import {
  createProduct,
  listBoms,
  listVendors,
  updateProduct,
} from '../../api/products';
import { useAuth } from '../../contexts/AuthContext';
import type {
  BomOption,
  FieldError,
  ProcurementType,
  Product,
  VendorOption,
} from '../../types/product';

interface ProductsFormProps {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  name: string;
  sales_price: string;
  cost_price: string;
  procure_on_demand: boolean;
  procurement_type: ProcurementType | '';
  vendor_id: string;
  default_bom_id: string;
}

function initialState(product: Product | null): FormState {
  if (!product) {
    return {
      name: '',
      sales_price: '0',
      cost_price: '0',
      procure_on_demand: false,
      procurement_type: '',
      vendor_id: '',
      default_bom_id: '',
    };
  }
  return {
    name: product.name,
    sales_price: product.sales_price,
    cost_price: product.cost_price,
    procure_on_demand: product.procure_on_demand,
    procurement_type: product.procurement_type ?? '',
    vendor_id: product.vendor_id ?? '',
    default_bom_id: product.default_bom_id ?? '',
  };
}

// ─── Role Config ─────────────────────────────────────────────────────────────

interface RoleConfig {
  label: string;
  accent: string;       // Tailwind text color class
  accentBg: string;     // Tailwind bg+border class
  gradient: string;     // Button gradient
  badgeText: string;    // Small badge inside modal header
  examplePlaceholder: string;
  showSalesPrice: boolean;
  showCostPrice: boolean;
  showProcureOnDemand: boolean;
  autosetProcurement: ProcurementType | null; // pre-set and hide procurement type
}

const ROLE_CONFIG: Record<string, RoleConfig> = {
  sales: {
    label: 'Finished Vehicle',
    accent: 'text-cyan-400',
    accentBg: 'bg-cyan-500/10 border-cyan-500/30',
    gradient: 'from-cyan-500 to-blue-500',
    badgeText: 'Sales Catalog',
    examplePlaceholder: 'e.g. Sedan - CityDrive X1',
    showSalesPrice: true,
    showCostPrice: false,
    showProcureOnDemand: false,
    autosetProcurement: null,
  },
  purchase: {
    label: 'Raw Component',
    accent: 'text-orange-400',
    accentBg: 'bg-orange-500/10 border-orange-500/30',
    gradient: 'from-orange-500 to-amber-500',
    badgeText: 'Procurement',
    examplePlaceholder: 'e.g. Engine Block, Pistons × 4',
    showSalesPrice: false,
    showCostPrice: true,
    showProcureOnDemand: true,
    autosetProcurement: 'purchase',
  },
  manufacturing: {
    label: 'Sub-Assembly / Product',
    accent: 'text-violet-400',
    accentBg: 'bg-violet-500/10 border-violet-500/30',
    gradient: 'from-violet-500 to-purple-600',
    badgeText: 'Production',
    examplePlaceholder: 'e.g. Engine Assembly, Chassis Frame',
    showSalesPrice: false,
    showCostPrice: true,
    showProcureOnDemand: true,
    autosetProcurement: 'manufacturing',
  },
  inventory: {
    label: 'Stock Item',
    accent: 'text-emerald-400',
    accentBg: 'bg-emerald-500/10 border-emerald-500/30',
    gradient: 'from-emerald-500 to-teal-500',
    badgeText: 'Inventory',
    examplePlaceholder: 'e.g. Brake Pad Set, Wiring Harness',
    showSalesPrice: false,
    showCostPrice: true,
    showProcureOnDemand: false,
    autosetProcurement: null,
  },
  owner: {
    label: 'Product',
    accent: 'text-yellow-400',
    accentBg: 'bg-yellow-500/10 border-yellow-500/30',
    gradient: 'from-yellow-500 to-orange-500',
    badgeText: 'Full Access',
    examplePlaceholder: 'e.g. Sedan - CityDrive X1',
    showSalesPrice: true,
    showCostPrice: true,
    showProcureOnDemand: true,
    autosetProcurement: null,
  },
};

// ─── Input / Label helpers ────────────────────────────────────────────────────

function FieldWrapper({ label, error, hint, children }: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-300">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

const inputCls = (hasError: boolean) =>
  `w-full bg-slate-800/60 border rounded-xl px-4 py-3 text-slate-200 placeholder:text-slate-500 
   focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all
   ${hasError ? 'border-red-500' : 'border-slate-700'}`;

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProductsForm({ product, onClose, onSaved }: ProductsFormProps) {
  const { user } = useAuth();
  const role = user?.role || 'owner';
  const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.owner;

  const isEdit = product !== null;

  const [form, setForm] = useState<FormState>(() => {
    const base = initialState(product);
    // Pre-set procurement type based on role if creating new
    if (!product && cfg.autosetProcurement) {
      base.procurement_type = cfg.autosetProcurement;
      base.procure_on_demand = true;
    }
    return base;
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState('');
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [boms, setBoms] = useState<BomOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (cfg.showProcureOnDemand) {
      listVendors().then(setVendors).catch(() => setVendors([]));
      listBoms().then(setBoms).catch(() => setBoms([]));
    }
  }, [cfg.showProcureOnDemand]);

  const errorFor = (field: string) => fieldErrors[field];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setTopError('');
    setIsSubmitting(true);

    const procurementType = form.procure_on_demand ? (form.procurement_type as ProcurementType | '') : '';
    const vendorId = form.procure_on_demand && procurementType === 'purchase' && form.vendor_id ? form.vendor_id : null;
    const bomId = form.procure_on_demand && procurementType === 'manufacturing' && form.default_bom_id ? form.default_bom_id : null;

    try {
      if (isEdit && product) {
        await updateProduct(product.id, {
          sales_price: Number(form.sales_price),
          cost_price: Number(form.cost_price),
          procure_on_demand: form.procure_on_demand,
          procurement_type: form.procure_on_demand ? (procurementType as ProcurementType) : null,
          vendor_id: vendorId,
          default_bom_id: bomId,
        });
      } else {
        await createProduct({
          name: form.name.trim(),
          sales_price: Number(form.sales_price),
          cost_price: Number(form.cost_price),
          procure_on_demand: form.procure_on_demand,
          procurement_type: form.procure_on_demand ? (procurementType as ProcurementType) : null,
          vendor_id: vendorId,
          default_bom_id: bomId,
        });
      }
      onSaved();
    } catch (err) {
      const axErr = err as AxiosError<{ detail: FieldError[] | string }>;
      const detail = axErr.response?.data?.detail;
      if (Array.isArray(detail)) {
        const map: Record<string, string> = {};
        detail.forEach((d) => { map[d.field] = d.message; });
        setFieldErrors(map);
      } else if (typeof detail === 'string') {
        setTopError(detail);
      } else {
        setTopError('Save failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPurchaseType = form.procurement_type === 'purchase';
  const isMfgType = form.procurement_type === 'manufacturing';

  // Effective procurement type label for hints
  const procHint: Record<ProcurementType, string> = {
    purchase: 'Sourced from a vendor — link a supplier below.',
    manufacturing: 'Built in-house — link a Bill of Materials below.',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className={`px-6 py-4 border-b border-slate-800 flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${cfg.accentBg} ${cfg.accent}`}>
              {cfg.badgeText}
            </div>
            <h2 className="text-base font-semibold text-white">
              {isEdit ? `Edit — ${product?.name}` : `New ${cfg.label}`}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {topError && (
            <div className="p-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg">{topError}</div>
          )}

          {/* ── Product Name ── */}
          <FieldWrapper label="Name" error={errorFor('name')}
            hint={isEdit ? 'Name is the unique identifier and cannot be changed.' : undefined}>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={isEdit}
              required
              className={inputCls(!!errorFor('name')) + (isEdit ? ' opacity-50 cursor-not-allowed' : '')}
              placeholder={cfg.examplePlaceholder}
            />
          </FieldWrapper>

          {/* ── Price Fields ── */}
          <div className={`grid gap-4 ${cfg.showSalesPrice && cfg.showCostPrice ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {cfg.showSalesPrice && (
              <FieldWrapper label="Sales Price (₹)" error={errorFor('sales_price')}>
                <input
                  type="number" min="0" step="0.01"
                  value={form.sales_price}
                  onChange={(e) => setForm({ ...form, sales_price: e.target.value })}
                  required
                  className={inputCls(!!errorFor('sales_price'))}
                />
              </FieldWrapper>
            )}
            {cfg.showCostPrice && (
              <FieldWrapper label="Cost Price (₹)" error={errorFor('cost_price')}>
                <input
                  type="number" min="0" step="0.01"
                  value={form.cost_price}
                  onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                  required
                  className={inputCls(!!errorFor('cost_price'))}
                />
              </FieldWrapper>
            )}
          </div>

          {/* ── Stock info (edit only) ── */}
          {isEdit && product && (
            <div className="grid grid-cols-2 gap-4 p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl">
              <div>
                <p className="text-xs text-slate-500 mb-1">On Hand</p>
                <p className="text-slate-200 font-mono text-sm">{product.on_hand_qty} units</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Free to Use</p>
                <p className="text-slate-200 font-mono text-sm">{product.free_to_use_qty} units</p>
              </div>
            </div>
          )}

          {/* ── Procurement section ── */}
          {cfg.showProcureOnDemand && (
            <div className={`rounded-xl border p-4 space-y-3 ${form.procure_on_demand ? 'border-slate-600 bg-slate-800/30' : 'border-slate-800'}`}>

              {/* Toggle — hide it for roles with a forced procurement type */}
              {!cfg.autosetProcurement && (
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div
                    onClick={() => setForm({
                      ...form,
                      procure_on_demand: !form.procure_on_demand,
                      ...(!form.procure_on_demand ? {} : { procurement_type: '', vendor_id: '', default_bom_id: '' }),
                    })}
                    className={`relative w-10 h-5 rounded-full transition-colors ${form.procure_on_demand ? 'bg-blue-500' : 'bg-slate-700'}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.procure_on_demand ? 'translate-x-5' : ''}`} />
                  </div>
                  <span className="text-sm text-slate-300">Procure on Demand</span>
                </label>
              )}

              {form.procure_on_demand && (
                <div className="space-y-3 pt-1">
                  {/* Procurement type — only show if owner (can choose) */}
                  {!cfg.autosetProcurement ? (
                    <FieldWrapper label="Procurement Type" error={errorFor('procurement_type')}>
                      <select
                        value={form.procurement_type}
                        onChange={(e) => setForm({ ...form, procurement_type: e.target.value as ProcurementType | '', vendor_id: '', default_bom_id: '' })}
                        required
                        className={inputCls(!!errorFor('procurement_type'))}
                      >
                        <option value="">— select type —</option>
                        <option value="purchase">Purchase (from vendor)</option>
                        <option value="manufacturing">Manufacturing (in-house)</option>
                      </select>
                    </FieldWrapper>
                  ) : (
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${cfg.accentBg} ${cfg.accent}`}>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {cfg.autosetProcurement === 'purchase' ? 'Procurement type: Purchase (Vendor sourced)' : 'Procurement type: Manufacturing (In-house assembly)'}
                    </div>
                  )}

                  {/* Hint */}
                  {form.procurement_type && (
                    <p className="text-xs text-slate-500">{procHint[form.procurement_type as ProcurementType]}</p>
                  )}

                  {/* Vendor dropdown — purchase roles */}
                  {(isPurchaseType) && (
                    <FieldWrapper label="Vendor / Supplier" error={errorFor('vendor_id')}>
                      <select
                        value={form.vendor_id}
                        onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}
                        required
                        className={inputCls(!!errorFor('vendor_id'))}
                      >
                        <option value="">— select vendor —</option>
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </select>
                      {vendors.length === 0 && (
                        <p className="text-xs text-amber-400 mt-1">No vendors found — add one in Purchase Orders first.</p>
                      )}
                    </FieldWrapper>
                  )}

                  {/* BOM dropdown — manufacturing roles */}
                  {(isMfgType) && (
                    <FieldWrapper label="Bill of Materials" error={errorFor('default_bom_id')}>
                      <select
                        value={form.default_bom_id}
                        onChange={(e) => setForm({ ...form, default_bom_id: e.target.value })}
                        required
                        className={inputCls(!!errorFor('default_bom_id'))}
                      >
                        <option value="">— select BOM —</option>
                        {boms.map((b) => (
                          <option key={b.id} value={b.id}>{b.reference}</option>
                        ))}
                      </select>
                      {boms.length === 0 && (
                        <p className="text-xs text-amber-400 mt-1">No BOMs yet — create a BOM first.</p>
                      )}
                    </FieldWrapper>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Role-specific context hints ── */}
          {!isEdit && (
            <div className={`rounded-xl border p-3 ${cfg.accentBg}`}>
              <p className={`text-xs font-semibold ${cfg.accent} mb-1`}>
                {role === 'sales' && '🚗 What to add here'}
                {role === 'purchase' && '📦 What to add here'}
                {role === 'manufacturing' && '🔧 What to add here'}
                {role === 'inventory' && '🗃️ What to add here'}
                {role === 'owner' && '⚙️ Product setup'}
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                {role === 'sales' && 'Add the finished vehicles you sell — e.g. Sedan CityDrive X1 (₹8.5L), SUV TerraCruise 4X4 (₹15L), or Electric VoltZip (₹12L). Set the customer-facing sales price.'}
                {role === 'purchase' && 'Add raw components you procure from vendors — Engine Block from Bharat Forge, MRF Tyres, Bosch ABS Sensors, etc. Set the cost price and link the vendor.'}
                {role === 'manufacturing' && 'Add sub-assemblies you build in-house — Engine Assembly, Transmission, Chassis Frame, Suspension, etc. Link a BOM to auto-pull component requirements.'}
                {role === 'inventory' && 'Add any stock item — raw parts, sub-assemblies, or finished vehicles — so they can be tracked in the warehouse.'}
                {role === 'owner' && 'Add any product to the catalog. Use procurement type to control whether it\'s bought or manufactured.'}
              </p>
            </div>
          )}

          {/* ── Footer Buttons ── */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-300 hover:bg-slate-800 transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 rounded-xl font-medium text-white bg-gradient-to-r ${cfg.gradient} disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg text-sm hover:brightness-110`}
            >
              {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : `Add ${cfg.label}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
