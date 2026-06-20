import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { purchaseOrdersApi, vendorsApi, productsForPurchaseApi } from '../../api/purchase';
import type { PurchaseOrder, Vendor, PurchaseOrderLineCreate } from '../../types/purchase';
import { PO_STATUS_COLORS, PO_STATUS_LABELS } from '../../types/purchase';

interface LineItem {
  id?: string;
  product_id: string;
  product_name: string;
  ordered_qty: number;
  received_qty: number;
  cost_price: number;
  line_total: number;
}

function ReceiveModal({ lines, onClose, onSubmit }: { lines: LineItem[]; onClose: () => void; onSubmit: (data: { line_id: string; received_qty: number }[]) => void; }) {
  const [qtys, setQtys] = useState<Record<string, number>>(Object.fromEntries(lines.map((line) => [line.id!, line.ordered_qty - line.received_qty])));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <h3 className="mb-4 text-lg font-semibold text-white">Receive Items</h3>
        <div className="mb-6 space-y-3">
          {lines.map((line) => (
            <div key={line.id} className="flex items-center gap-4">
              <span className="flex-1 text-sm text-slate-300">{line.product_name}</span>
              <span className="text-xs text-slate-500">Remaining: {line.ordered_qty - line.received_qty}</span>
              <input type="number" min={0} max={line.ordered_qty - line.received_qty} value={qtys[line.id!] ?? 0} onChange={(e) => setQtys((current) => ({ ...current, [line.id!]: Number(e.target.value) }))} className="w-24 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
          <button onClick={() => onSubmit(lines.map((line) => ({ line_id: line.id!, received_qty: qtys[line.id!] ?? 0 })))} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500">Confirm Receipt</button>
        </div>
      </div>
    </div>
  );
}

export default function PurchaseOrderForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isSystemAdmin } = useAuth();
  const isNew = !id || id === 'new';

  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [lines, setLines] = useState<LineItem[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; cost_price: number; on_hand_qty: number }[]>([]);
  const [showReceiveModal, setShowReceiveModal] = useState(false);

  useEffect(() => {
    loadLookups();
    if (!isNew && id) loadOrder(id);
  }, [id]);

  const loadLookups = async () => {
    try {
      const [vendorData, productData] = await Promise.all([vendorsApi.list(), productsForPurchaseApi.list()]);
      setVendors(vendorData);
      setProducts(productData);
    } catch {
      // silent
    }
  };

  const loadOrder = async (orderId: string) => {
    try {
      setLoading(true);
      const data = await purchaseOrdersApi.get(orderId);
      setOrder(data);
      setVendorId(data.vendor.id);
      setLines(data.lines.map((line) => ({ id: line.id, product_id: line.product_id, product_name: line.product_name, ordered_qty: Number(line.ordered_qty), received_qty: Number(line.received_qty), cost_price: Number(line.cost_price), line_total: Number(line.line_total) })));
    } catch {
      setError('Failed to load purchase order');
    } finally {
      setLoading(false);
    }
  };

  const addLine = () => {
    if (products.length === 0) return;
    const product = products[0];
    setLines((current) => [...current, { product_id: product.id, product_name: product.name, ordered_qty: 1, received_qty: 0, cost_price: product.cost_price, line_total: product.cost_price }]);
  };

  const updateLine = (index: number, field: keyof LineItem, value: string) => {
    setLines((current) => current.map((line, idx) => {
      if (idx !== index) return line;
      const next = { ...line };
      if (field === 'product_id') {
        const product = products.find((entry) => entry.id === value);
        if (product) {
          next.product_id = product.id;
          next.product_name = product.name;
          next.cost_price = product.cost_price;
        }
      } else if (field === 'ordered_qty') {
        next.ordered_qty = Number(value) || 0;
      }
      next.line_total = next.ordered_qty * next.cost_price;
      return next;
    }));
  };

  const handleSave = async () => {
    if (!vendorId) { setError('Please select a vendor'); return; }
    if (lines.length === 0) { setError('Add at least one line item'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        vendor_id: vendorId,
        line_items: lines.map((line): PurchaseOrderLineCreate => ({ product_id: line.product_id, ordered_qty: line.ordered_qty })),
      };
      const saved = await purchaseOrdersApi.create(payload);
      navigate(`/purchase/${saved.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save order');
    } finally {
      setSaving(false);
    }
  };

  const doAction = async (action: () => Promise<PurchaseOrder>) => {
    setActionError('');
    try {
      const updated = await action();
      setOrder(updated);
      setLines(updated.lines.map((line) => ({ id: line.id, product_id: line.product_id, product_name: line.product_name, ordered_qty: Number(line.ordered_qty), received_qty: Number(line.received_qty), cost_price: Number(line.cost_price), line_total: Number(line.line_total) })));
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Action failed');
    }
  };

  const handleReceive = async (receiveLines: { line_id: string; received_qty: number }[]) => {
    setShowReceiveModal(false);
    if (!order) return;
    await doAction(() => purchaseOrdersApi.receive(order.id, { lines: receiveLines }));
  };

  const status = order?.status || 'draft';

  const getFieldLockState = (status: string, fieldName: string) => {
    if (status === 'fully_received' || status === 'cancelled') return true;
    if (status !== 'draft' && ['vendor_id', 'lines'].includes(fieldName)) return true;
    return false;
  };

  const isReadonly = status === 'fully_received' || status === 'cancelled';
  const isVendorLocked = getFieldLockState(status, 'vendor_id');
  const isLinesLocked = getFieldLockState(status, 'lines');

  const canReceive = order && ['confirmed', 'partially_received'].includes(order.status);
  const canCancel = order && !['fully_received', 'cancelled'].includes(order.status);

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" /></div>;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/purchase')} className="text-slate-400 transition-colors hover:text-white">← Back</button>
        <div>
          <h1 className="text-2xl font-bold text-white">{isNew ? 'New Purchase Order' : order?.reference}</h1>
          {order && <span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${PO_STATUS_COLORS[order.status]}`}>{PO_STATUS_LABELS[order.status]}</span>}
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>}
      {actionError && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{actionError}</div>}

      {order?.vendor_address && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Vendor Address</p>
          <p className="mt-1 text-sm text-slate-200">{order.vendor_address}</p>
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-400">Vendor *</label>
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} disabled={isVendorLocked} className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50">
            <option value="">Select vendor...</option>
            {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Order Lines</h2>
          {!isLinesLocked && !isReadonly && <button onClick={addLine} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-700">+ Add Line</button>}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="pb-2">Product</th>
              <th className="pb-2 text-right">Ordered Qty</th>
              <th className="pb-2 text-right">Received Qty</th>
              <th className="pb-2 text-right">Unit Cost</th>
              <th className="pb-2 text-right">Total</th>
              {!isLinesLocked && !isReadonly && <th className="pb-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {lines.map((line, index) => (
              <tr key={index}>
                <td className="py-3">
                  {!isLinesLocked && !isReadonly ? (
                    <select value={line.product_id} onChange={(e) => updateLine(index, 'product_id', e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200">
                      {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                  ) : <span className="text-slate-200">{line.product_name}</span>}
                </td>
                <td className="py-3 text-right">
                  {!isLinesLocked && !isReadonly ? <input type="number" min={1} value={line.ordered_qty} onChange={(e) => updateLine(index, 'ordered_qty', e.target.value)} className="w-24 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-right text-slate-200" /> : <span className="text-slate-200">{line.ordered_qty}</span>}
                </td>
                <td className="py-3 text-right text-slate-400">{line.received_qty}</td>
                <td className="py-3 text-right text-slate-300">${line.cost_price.toFixed(2)}</td>
                <td className="py-3 text-right font-medium text-white">${line.line_total.toFixed(2)}</td>
                {!isLinesLocked && !isReadonly && <td className="py-3 pl-3"><button onClick={() => setLines((current) => current.filter((_, idx) => idx !== index))} className="text-xs text-red-400 hover:text-red-300">✕</button></td>}
              </tr>
            ))}
            {lines.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-500">No lines added</td></tr>}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4} className="pt-3 text-right font-medium text-slate-400">Total:</td>
                <td className="pt-3 text-right font-bold text-white">${lines.reduce((sum, line) => sum + line.line_total, 0).toFixed(2)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex flex-wrap gap-3">
        {isNew && <button onClick={handleSave} disabled={saving} className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-2.5 font-medium text-white transition-all disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>}
        {isSystemAdmin && order?.status === 'draft' && !isNew && <button onClick={() => doAction(() => purchaseOrdersApi.confirm(order.id))} className="rounded-xl bg-blue-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-blue-500">Confirm</button>}
        {canReceive && <button onClick={() => setShowReceiveModal(true)} className="rounded-xl bg-emerald-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-emerald-500">Receive</button>}
        {canCancel && !isNew && <button onClick={() => doAction(() => purchaseOrdersApi.cancel(order!.id))} className="rounded-xl bg-slate-700 px-5 py-2.5 font-medium text-white transition-colors hover:bg-slate-600">Cancel Order</button>}
        {order && <button onClick={() => navigate(`/admin/audit?module=Purchase&record_id=${order.id}`)} className="rounded-xl bg-slate-800 border border-slate-700 px-5 py-2.5 font-medium text-white transition-colors hover:bg-slate-700">Logs</button>}
      </div>

      {showReceiveModal && order && <ReceiveModal lines={lines.filter((line) => line.received_qty < line.ordered_qty)} onClose={() => setShowReceiveModal(false)} onSubmit={handleReceive} />}
    </div>
  );
}