import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import {
  deleteProduct,
  getProductStock,
  listProducts,
} from '../../api/products';
import type { Product, ProductStock, ProductType } from '../../types/product';
import ProductsForm from './ProductsForm';

interface StockDrawerState {
  product: Product;
  stock: ProductStock | null;
  loading: boolean;
  error: string | null;
}

type FilterTab = 'all' | 'finished_good' | 'sub_assembly' | 'raw_component';

const TYPE_LABEL: Record<ProductType, string> = {
  finished_good: 'Finished Good',
  sub_assembly: 'Sub-assembly',
  raw_component: 'Raw Component',
};

// Deterministic gradient per product, so each card has its own colored hero.
function gradientFor(id: string): string {
  const palette = [
    'from-cyan-500/40 via-blue-500/30 to-slate-800',
    'from-amber-500/40 via-orange-500/30 to-slate-800',
    'from-emerald-500/40 via-teal-500/30 to-slate-800',
    'from-fuchsia-500/40 via-purple-500/30 to-slate-800',
    'from-rose-500/40 via-pink-500/30 to-slate-800',
    'from-indigo-500/40 via-blue-500/30 to-slate-800',
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export default function ProductsList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formProduct, setFormProduct] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [stockDrawer, setStockDrawer] = useState<StockDrawerState | null>(null);
  const [deleteFor, setDeleteFor] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listProducts();
      setProducts(data);
    } catch (err) {
      const axErr = err as AxiosError<{ detail: string }>;
      setError(axErr.response?.data?.detail || 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const filtered = products.filter((p) => {
    if (tab !== 'all' && p.product_type !== tab) return false;
    if (search.trim() && !p.name.toLowerCase().includes(search.trim().toLowerCase()))
      return false;
    return true;
  });

  const openCreate = () => {
    setFormProduct(null);
    setFormOpen(true);
  };

  const openEdit = (p: Product) => {
    setOpenMenuFor(null);
    setFormProduct(p);
    setFormOpen(true);
  };

  const openStock = async (p: Product) => {
    setOpenMenuFor(null);
    setStockDrawer({ product: p, stock: null, loading: true, error: null });
    try {
      const s = await getProductStock(p.id);
      setStockDrawer({ product: p, stock: s, loading: false, error: null });
    } catch (err) {
      const axErr = err as AxiosError<{ detail: string }>;
      setStockDrawer({
        product: p,
        stock: null,
        loading: false,
        error: axErr.response?.data?.detail || 'Failed to load stock.',
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleteFor) return;
    setDeleteError('');
    try {
      await deleteProduct(deleteFor.id);
      setDeleteFor(null);
      await refresh();
    } catch (err) {
      const axErr = err as AxiosError<{ detail: string }>;
      if (axErr.response?.status === 409) {
        setDeleteError(
          axErr.response?.data?.detail ||
            'Cannot delete product in stock. Stock must be zero.',
        );
      } else if (axErr.response?.status === 403) {
        setDeleteError('You do not have permission to delete products.');
      } else {
        setDeleteError(axErr.response?.data?.detail || 'Failed to delete product.');
      }
    }
  };

  // ─── Tab definitions ────────────────────────────────────────────────
  const tabs: { value: FilterTab; label: string }[] = [
    { value: 'all', label: 'All_Components' },
    { value: 'finished_good', label: 'Finished' },
    { value: 'sub_assembly', label: 'Sub-Assembly' },
    { value: 'raw_component', label: 'Raw' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Products</h1>
          <p className="text-sm text-slate-500 mt-1">
            Component catalog · on-hand and reserved figures update via stock movements
          </p>
        </div>
      </div>

      {/* Search + Action row */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[240px] relative">
          <svg
            className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Query database (engine, rotor, ...)"
            className="w-full bg-slate-900/70 border border-slate-800 rounded-xl pl-11 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          />
        </div>
        <button
          onClick={refresh}
          className="px-4 py-2.5 rounded-xl text-sm text-slate-300 bg-slate-900/70 border border-slate-800 hover:bg-slate-800 transition-colors"
        >
          Refresh
        </button>
        <button
          onClick={openCreate}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold tracking-[0.15em] uppercase bg-indigo-200 text-slate-900 hover:bg-indigo-100 transition-colors"
        >
          + New_Entry
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-[0.18em] uppercase transition-colors ${
              tab === t.value
                ? 'bg-cyan-500/15 border border-cyan-500/40 text-cyan-300'
                : 'bg-slate-900/70 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl">
          {error}
        </div>
      )}

      {/* Card grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
          {products.length === 0
            ? 'No products yet. Click + NEW_ENTRY to add one.'
            : 'No products match your filters.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((p, idx) => {
            const onHand = Number(p.on_hand_qty);
            const free = Number(p.free_to_use_qty);
            const status =
              free <= 0
                ? { dot: 'bg-rose-400', label: 'Out of Stock', text: 'text-rose-300' }
                : free < 10
                  ? { dot: 'bg-amber-400', label: 'Reorder Soon', text: 'text-amber-300' }
                  : { dot: 'bg-emerald-400', label: 'Optimal Stock', text: 'text-emerald-300' };

            return (
              <div
                key={p.id}
                className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden flex flex-col"
              >
                {/* Hero */}
                <div
                  className={`relative aspect-[16/10] bg-gradient-to-br ${gradientFor(p.id)} flex items-center justify-center`}
                >
                  {/* TRQ badge */}
                  <span className="absolute top-3 right-3 font-mono text-[10px] tracking-widest text-cyan-300 bg-slate-950/60 backdrop-blur px-2 py-1 rounded-md border border-cyan-500/30">
                    ID: TRQ-{String(idx + 1).padStart(3, '0')}
                  </span>

                  {/* Glyph */}
                  <svg
                    className="w-14 h-14 text-white/70"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>

                {/* Body */}
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="text-white font-semibold text-base truncate">{p.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {TYPE_LABEL[p.product_type]}
                    {p.procure_on_demand ? ' · on-demand' : ''}
                  </p>

                  <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t border-slate-800">
                    <div>
                      <p className="text-[9px] tracking-[0.2em] text-slate-500 uppercase">
                        Sales Price
                      </p>
                      <p className="text-cyan-300 text-lg font-semibold tabular-nums mt-0.5">
                        ${Number(p.sales_price).toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] tracking-[0.2em] text-slate-500 uppercase">
                        On Hand
                      </p>
                      <p className="text-amber-300 text-lg font-semibold tabular-nums mt-0.5">
                        {onHand}
                        <span className="ml-1 text-[10px] tracking-[0.2em] text-slate-500 uppercase">
                          units
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Status row */}
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                      <span
                        className={`text-[10px] tracking-[0.2em] uppercase ${status.text}`}
                      >
                        {status.label}
                      </span>
                    </div>

                    {/* Triple-dot menu */}
                    <div className="relative">
                      <button
                        onClick={() =>
                          setOpenMenuFor(openMenuFor === p.id ? null : p.id)
                        }
                        className="text-slate-500 hover:text-slate-200 p-1 rounded"
                        aria-label="Actions"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="5" cy="12" r="1.6" />
                          <circle cx="12" cy="12" r="1.6" />
                          <circle cx="19" cy="12" r="1.6" />
                        </svg>
                      </button>

                      {openMenuFor === p.id && (
                        <div className="absolute right-0 bottom-full mb-1 w-36 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-10">
                          <button
                            onClick={() => openStock(p)}
                            className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-800"
                          >
                            View Stock
                          </button>
                          <button
                            onClick={() => openEdit(p)}
                            className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-800"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setOpenMenuFor(null);
                              setDeleteError('');
                              setDeleteFor(p);
                            }}
                            className="w-full text-left px-4 py-2 text-xs text-rose-300 hover:bg-slate-800"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals — kept as-is */}
      {formOpen && (
        <ProductsForm
          product={formProduct}
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false);
            await refresh();
          }}
        />
      )}

      {stockDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Stock — {stockDrawer.product.name}
              </h2>
              <button
                onClick={() => setStockDrawer(null)}
                className="text-slate-500 hover:text-slate-200 transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-3">
              {stockDrawer.loading ? (
                <p className="text-slate-400 text-center">Loading live stock…</p>
              ) : stockDrawer.error ? (
                <p className="text-rose-300 text-sm">{stockDrawer.error}</p>
              ) : stockDrawer.stock ? (
                <>
                  <div className="flex items-center justify-between p-3 bg-slate-800/30 border border-slate-800 rounded-lg">
                    <span className="text-slate-400 text-sm">On Hand</span>
                    <span className="font-mono text-slate-200">
                      {stockDrawer.stock.on_hand_qty}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-800/30 border border-slate-800 rounded-lg">
                    <span className="text-slate-400 text-sm">Reserved</span>
                    <span className="font-mono text-slate-200">
                      {stockDrawer.stock.reserved_qty}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                    <span className="text-cyan-300 text-sm font-medium">Free to Use</span>
                    <span className="font-mono text-cyan-200">
                      {stockDrawer.stock.free_to_use_qty}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 pt-2">
                    Computed live from active sales orders and manufacturing components.
                  </p>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {deleteFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800">
              <h2 className="text-lg font-semibold text-white">Delete product?</h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-300">
                Delete <span className="font-medium text-white">{deleteFor.name}</span>?
                This cannot be undone.
              </p>
              {deleteError && (
                <div className="p-3 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg">
                  {deleteError}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setDeleteFor(null);
                    setDeleteError('');
                  }}
                  className="px-4 py-2 rounded-xl text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 rounded-xl font-medium text-white bg-rose-500 hover:bg-rose-400 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
