import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import {
  deleteProduct,
  getProductStock,
  listProducts,
} from '../../api/products';
import type { Product, ProductStock } from '../../types/product';
import ProductsForm from './ProductsForm';

interface StockDrawerState {
  product: Product;
  stock: ProductStock | null;
  loading: boolean;
  error: string | null;
}

export default function ProductsList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formProduct, setFormProduct] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [stockDrawer, setStockDrawer] = useState<StockDrawerState | null>(null);
  const [deleteFor, setDeleteFor] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState('');

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

  const filtered = search.trim()
    ? products.filter((p) =>
        p.name.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : products;

  const openCreate = () => {
    setFormProduct(null);
    setFormOpen(true);
  };

  const openEdit = (p: Product) => {
    setFormProduct(p);
    setFormOpen(true);
  };

  const openStock = async (p: Product) => {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Products</h1>
          <p className="text-sm text-slate-400">
            Manage the product catalog. On-hand and reserved figures update through
            stock movements.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-5 py-2.5 rounded-xl font-medium text-white bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 transition-all shadow-lg shadow-blue-500/25"
        >
          + New Product
        </button>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
          className="flex-1 max-w-md bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
        />
        <button
          onClick={refresh}
          className="px-4 py-2.5 rounded-xl text-sm text-slate-300 border border-slate-800 hover:bg-slate-800 transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/50 text-slate-400 uppercase tracking-wider text-xs">
            <tr>
              <th className="text-left px-5 py-3 font-medium">Name</th>
              <th className="text-right px-5 py-3 font-medium">Sales Price</th>
              <th className="text-right px-5 py-3 font-medium">Cost Price</th>
              <th className="text-right px-5 py-3 font-medium">On Hand</th>
              <th className="text-right px-5 py-3 font-medium">Free to Use</th>
              <th className="text-center px-5 py-3 font-medium">Procure on Demand</th>
              <th className="text-right px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                  {products.length === 0
                    ? 'No products yet. Click "New Product" to add one.'
                    : 'No products match your search.'}
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3 text-slate-200">{p.name}</td>
                  <td className="px-5 py-3 text-right font-mono text-slate-300">
                    {p.sales_price}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-slate-300">
                    {p.cost_price}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-slate-300">
                    {p.on_hand_qty}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-slate-300">
                    {p.free_to_use_qty}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={p.procure_on_demand}
                      readOnly
                      className="w-4 h-4 rounded border-slate-700 bg-slate-800/50 text-blue-500 pointer-events-none"
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        onClick={() => openStock(p)}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        View Stock
                      </button>
                      <span className="text-slate-700">|</span>
                      <button
                        onClick={() => openEdit(p)}
                        className="text-xs text-emerald-400 hover:text-emerald-300"
                      >
                        Edit
                      </button>
                      <span className="text-slate-700">|</span>
                      <button
                        onClick={() => {
                          setDeleteError('');
                          setDeleteFor(p);
                        }}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
                <p className="text-red-400 text-sm">{stockDrawer.error}</p>
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
                  <div className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <span className="text-blue-400 text-sm font-medium">Free to Use</span>
                    <span className="font-mono text-blue-300">
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
                <div className="p-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg">
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
                  className="px-4 py-2 rounded-xl font-medium text-white bg-red-500 hover:bg-red-400 transition-colors"
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
