import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import {
  createProduct,
  listBoms,
  listVendors,
  updateProduct,
} from '../../api/products';
import type {
  BomOption,
  FieldError,
  ProcurementType,
  Product,
  VendorOption,
} from '../../types/product';

interface ProductsFormProps {
  product: Product | null; // null = create mode, otherwise edit mode
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

export default function ProductsForm({
  product,
  onClose,
  onSaved,
}: ProductsFormProps) {
  const isEdit = product !== null;
  const [form, setForm] = useState<FormState>(() => initialState(product));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState('');
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [boms, setBoms] = useState<BomOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    listVendors()
      .then(setVendors)
      .catch(() => setVendors([]));
    listBoms()
      .then(setBoms)
      .catch(() => setBoms([]));
  }, []);

  const errorFor = (field: string): string | undefined => fieldErrors[field];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setTopError('');
    setIsSubmitting(true);

    const procurementType = form.procure_on_demand
      ? (form.procurement_type as ProcurementType | '')
      : '';
    const vendorId =
      form.procure_on_demand && procurementType === 'purchase' && form.vendor_id
        ? form.vendor_id
        : null;
    const bomId =
      form.procure_on_demand &&
      procurementType === 'manufacturing' &&
      form.default_bom_id
        ? form.default_bom_id
        : null;

    try {
      if (isEdit && product) {
        await updateProduct(product.id, {
          sales_price: Number(form.sales_price),
          cost_price: Number(form.cost_price),
          procure_on_demand: form.procure_on_demand,
          procurement_type: form.procure_on_demand
            ? (procurementType as ProcurementType)
            : null,
          vendor_id: vendorId,
          default_bom_id: bomId,
        });
      } else {
        await createProduct({
          name: form.name.trim(),
          sales_price: Number(form.sales_price),
          cost_price: Number(form.cost_price),
          procure_on_demand: form.procure_on_demand,
          procurement_type: form.procure_on_demand
            ? (procurementType as ProcurementType)
            : null,
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
        detail.forEach((d) => {
          map[d.field] = d.message;
        });
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? `Edit Product — ${product?.name}` : 'New Product'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {topError && (
            <div className="p-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg">
              {topError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-400">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={isEdit}
              required
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              placeholder="e.g. Office Chair"
            />
            {errorFor('name') && (
              <p className="text-xs text-red-400">{errorFor('name')}</p>
            )}
            {isEdit && (
              <p className="text-xs text-slate-500">
                Name is the unique identifier and cannot be changed.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-400">
                Sales Price
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.sales_price}
                onChange={(e) => setForm({ ...form, sales_price: e.target.value })}
                required
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
              />
              {errorFor('sales_price') && (
                <p className="text-xs text-red-400">{errorFor('sales_price')}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-400">
                Cost Price
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                required
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
              />
              {errorFor('cost_price') && (
                <p className="text-xs text-red-400">{errorFor('cost_price')}</p>
              )}
            </div>
          </div>

          {isEdit && product && (
            <div className="grid grid-cols-2 gap-4 p-3 bg-slate-800/30 border border-slate-800 rounded-xl">
              <div>
                <p className="text-xs text-slate-500">On Hand</p>
                <p className="text-slate-200 font-mono">{product.on_hand_qty}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Free to Use</p>
                <p className="text-slate-200 font-mono">{product.free_to_use_qty}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <input
              id="procure_on_demand"
              type="checkbox"
              checked={form.procure_on_demand}
              onChange={(e) =>
                setForm({
                  ...form,
                  procure_on_demand: e.target.checked,
                  ...(e.target.checked
                    ? {}
                    : { procurement_type: '', vendor_id: '', default_bom_id: '' }),
                })
              }
              className="w-4 h-4 rounded border-slate-700 bg-slate-800/50 text-blue-500 focus:ring-blue-500/50"
            />
            <label htmlFor="procure_on_demand" className="text-sm text-slate-300">
              Procure on Demand
            </label>
          </div>
          {errorFor('procure_on_demand') && (
            <p className="text-xs text-red-400">{errorFor('procure_on_demand')}</p>
          )}

          {form.procure_on_demand && (
            <div className="space-y-4 pl-6 border-l-2 border-blue-500/30">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-400">
                  Procurement Type
                </label>
                <select
                  value={form.procurement_type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      procurement_type: e.target.value as ProcurementType | '',
                      vendor_id: '',
                      default_bom_id: '',
                    })
                  }
                  required
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                >
                  <option value="">— select —</option>
                  <option value="purchase">Purchase</option>
                  <option value="manufacturing">Manufacturing</option>
                </select>
                {errorFor('procurement_type') && (
                  <p className="text-xs text-red-400">{errorFor('procurement_type')}</p>
                )}
              </div>

              {form.procurement_type === 'purchase' && (
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-400">
                    Vendor
                  </label>
                  <select
                    value={form.vendor_id}
                    onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}
                    required
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  >
                    <option value="">— select vendor —</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  {vendors.length === 0 && (
                    <p className="text-xs text-amber-400">
                      No vendors available — add one first.
                    </p>
                  )}
                  {errorFor('vendor_id') && (
                    <p className="text-xs text-red-400">{errorFor('vendor_id')}</p>
                  )}
                </div>
              )}

              {form.procurement_type === 'manufacturing' && (
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-400">
                    Bill of Materials
                  </label>
                  <select
                    value={form.default_bom_id}
                    onChange={(e) =>
                      setForm({ ...form, default_bom_id: e.target.value })
                    }
                    required
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  >
                    <option value="">— select BoM —</option>
                    {boms.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.reference}
                      </option>
                    ))}
                  </select>
                  {boms.length === 0 && (
                    <p className="text-xs text-amber-400">
                      No BoMs available — add one first.
                    </p>
                  )}
                  {errorFor('default_bom_id') && (
                    <p className="text-xs text-red-400">{errorFor('default_bom_id')}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-300 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl font-medium text-white bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25"
            >
              {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
