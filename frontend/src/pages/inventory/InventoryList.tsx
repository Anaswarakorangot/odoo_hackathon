import { useEffect, useState } from 'react';
import { listProducts } from '../../api/products';
import type { Product, ProductType } from '../../types/product';

type FilterTab = 'all' | 'finished_good' | 'sub_assembly' | 'raw_component';

const TYPE_LABEL: Record<ProductType, string> = {
  finished_good: 'Finished Good',
  sub_assembly: 'Sub-assembly',
  raw_component: 'Raw Component',
};

const TYPE_COLORS: Record<ProductType, string> = {
  finished_good: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  sub_assembly: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  raw_component: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

export default function InventoryList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listProducts();
      setProducts(data);
    } catch {
      setError('Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const filtered = products.filter((p) => {
    const matchesTab = tab === 'all' || p.product_type === tab;
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  // Calculate totals
  const totalOnHand = filtered.reduce((sum, p) => sum + parseFloat(p.on_hand_qty || '0'), 0);
  const totalReserved = filtered.reduce((sum, p) => sum + parseFloat(p.reserved_qty || '0'), 0);
  const totalFreeToUse = filtered.reduce((sum, p) => sum + parseFloat(p.free_to_use_qty || '0'), 0);
  const lowStockCount = filtered.filter((p) => parseFloat(p.free_to_use_qty || '0') <= 0).length;

  const getStockStatus = (product: Product) => {
    const freeToUse = parseFloat(product.free_to_use_qty || '0');
    const onHand = parseFloat(product.on_hand_qty || '0');

    if (freeToUse <= 0 && onHand <= 0) {
      return { label: 'Out of Stock', color: 'bg-red-500/20 text-red-400 border-red-500/30' };
    }
    if (freeToUse <= 0) {
      return { label: 'Fully Reserved', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
    }
    if (freeToUse < 10) {
      return { label: 'Low Stock', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
    }
    return { label: 'In Stock', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Inventory</h1>
        <p className="mt-1 text-sm text-slate-400">Track stock levels across all products</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">Total On Hand</div>
          <div className="mt-1 text-2xl font-bold text-white">{totalOnHand.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">Reserved</div>
          <div className="mt-1 text-2xl font-bold text-amber-400">{totalReserved.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">Free to Use</div>
          <div className="mt-1 text-2xl font-bold text-emerald-400">{totalFreeToUse.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">Low/Out of Stock</div>
          <div className="mt-1 text-2xl font-bold text-red-400">{lowStockCount}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex rounded-xl bg-slate-800 p-1">
          {(['all', 'finished_good', 'sub_assembly', 'raw_component'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t === 'all' ? 'All' : TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
        />
        <button
          onClick={refresh}
          className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-slate-300 hover:bg-slate-700"
        >
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/50">
                <th className="px-6 py-4 text-left text-sm font-medium text-slate-400">Product</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-slate-400">Type</th>
                <th className="px-6 py-4 text-right text-sm font-medium text-slate-400">On Hand</th>
                <th className="px-6 py-4 text-right text-sm font-medium text-slate-400">Reserved</th>
                <th className="px-6 py-4 text-right text-sm font-medium text-slate-400">Free to Use</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    No products found.
                  </td>
                </tr>
              ) : (
                filtered.map((product) => {
                  const status = getStockStatus(product);
                  return (
                    <tr
                      key={product.id}
                      className="border-b border-slate-800/50 transition-colors hover:bg-slate-800/30"
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{product.name}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-medium ${TYPE_COLORS[product.product_type]}`}>
                          {TYPE_LABEL[product.product_type]}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-slate-200">
                        {parseFloat(product.on_hand_qty || '0').toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-amber-400">
                        {parseFloat(product.reserved_qty || '0').toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-emerald-400">
                        {parseFloat(product.free_to_use_qty || '0').toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-medium ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
