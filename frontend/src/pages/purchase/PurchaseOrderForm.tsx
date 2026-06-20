import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { purchaseOrdersApi, vendorsApi, productsForPurchaseApi } from '../../api/purchase';
import type { PurchaseOrder, Vendor, PurchaseOrderLineCreate } from '../../types/purchase';
import { PO_STATUS_COLORS, PO_STATUS_LABELS } from '../../types/purchase';
import { useAuth } from '../../contexts/AuthContext';

interface LineItem {
  id?: string;
  product_id: string;
  product_name: string;
  ordered_qty: number;
  received_qty: number;
  cost_price: number;
  line_total: number;
}

// Receive Modal
function ReceiveModal({
  lines,
  onClose,
  onSubmit,
}: {
  lines: LineItem[];
  onClose: () => void;
  onSubmit: (data: { line_id: string; received_qty: number }[]) => void;
}) {
  const [qtys, setQtys] = useState<Record<string, number>>(
    Object.fromEntries(lines.map((l) => [l.id!, l.ordered_qty - l.received_qty]))
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Receive Items</h3>
        <div className="space-y-3 mb-6">
          {lines.map((line) => (
            <div key={line.id} className="flex items-center gap-4">
              <span className="flex-1 text-slate-300 text-sm">{line.product_name}</span>
              <span className="text-slate-500 text-xs">Remaining: {line.ordered_qty - line.received_qty}</span>
              <input
                type="number"
                min={0}
                max={line.ordered_qty - line.received_qty}
                value={qtys[line.id!] ?? 0}
                onChange={(e) => setQtys((q) => ({ ...q, [line.id!]: Number(e.target.value) }))}
                className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
          <button
            onClick={() => onSubmit(lines.map((l) => ({ line_id: l.id!, received_qty: qtys[l.id!] ?? 0 })))}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition-colors"
          >
            Confirm Receipt
          </button>
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
      const [vData, pData] = await Promise.all([vendorsApi.list(), productsForPurchaseApi.list()]);
      setVendors(vData);
      setProducts(pData);
    } catch { /* silent */ }
  };

  const loadOrder = async (orderId: string) => {
    try {
      setLoading(true);
      const data = await purchaseOrdersApi.get(orderId);
      setOrder(data);
      setVendorId(data.vendor.id);
      setLines(data.lines.map((l) => ({
        id: l.id,
        product_id: l.product_id,
        product_name: l.product_name,
        ordered_qty: Number(l.ordered_qty),
        received_qty: Number(l.received_qty),
        cost_price: Number(l.cost_price),
        line_total: Number(l.line_total),
      })));
    } catch {
      setError('Failed to load purchase order');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!vendorId) { setError('Please select a vendor'); return; }
    if (lines.length === 0) { setError('Add at least one line item'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        vendor_id: vendorId,
        line_items: lines.map((l): PurchaseOrderLineCreate => ({ product_id: l.product_id, ordered_qty: l.ordered_qty })),
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
      setLines(updated.lines.map((l) => ({
        id: l.id,
        product_id: l.product_id,
        product_name: l.product_name,
        ordered_qty: Number(l.ordered_qty),
        received_qty: Number(l.received_qty),
        cost_price: Number(l.cost_price),
        line_total: Number(l.line_total),
      })));
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Action failed');
    }
  };

  const handleReceive = async (receiveLines: { line_id: string; received_qty: number }[]) => {
    setShowReceiveModal(false);
    await doAction(() => purchaseOrdersApi.receive(order!.id, { lines: receiveLines }));
  };

  const addLine = () => {
    if (products.length === 0) return;
    const p = products[0];
    setLines((l) => [...l, { product_id: p.id, product_name: p.name, ordered_qty: 1, received_qty: 0, cost_price: p.cost_price, line_total: p.cost_price }]);
  };

  const updateLine = (idx: number, field: string, val: string) => {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: field === 'product_id' ? val : Number(val) };
      if (field === 'product_id') {
        const p = products.find((x) => x.id === val);
        if (p) { updated.product_name = p.name; updated.cost_price = p.cost_price; }
      }
      updated.line_total = updated.ordered_qty * updated.cost_price;
      return updated;
    }));
  };

  const isLocked = order?.status === 'fully_received' || order?.status === 'cancelled';
  const canReceive = order && ['confirmed', 'partially_received'].includes(order.status);
  const canCancel = order && !['fully_received', 'cancelled'].includes(order.status);

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back + Title */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/purchase')} className="text-slate-400 hover:text-white transition-colors">
          ← Back
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">
            {isNew ? 'New Purchase Order' : order?.reference}
          </h1>
          {order && (
            <span className={`mt-1 inline-block px-2.5 py-1 rounded-full text-xs font-medium ${PO_STATUS_COLORS[order.status]}`}>
              {PO_STATUS_LABELS[order.status]}
            </span>
          )}
        </div>
      </div>

      {/* Auto-created banner */}
      {order?.auto_created && order.source_sales_order_ref && (
        <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl text-purple-300 text-sm">
          🔗 Auto-created from Sales Order <strong>{order.source_sales_order_ref}</strong>
        </div>
      )}

      {error && <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>}
      {actionError && <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{actionError}</div>}

      {/* Vendor */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Order Details</h2>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Vendor</label>
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            disabled={!isNew && !!order}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50"
          >
            <option value="">Select vendor...</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        {order?.vendor_address && (
          <div>
            <label className="block text-sm text-slate-400 mb-1">Vendor Address</label>
            <p className="text-slate-300 text-sm">{order.vendor_address}</p>
          </div>
        )}
      </div>

      {/* Lines */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Order Lines</h2>
          {(isNew || order?.status === 'draft') && (
            <button
              onClick={addLine}
              className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
            >
              + Add Line
            </button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-800">
              <th className="pb-2">Product</th>
              <th className="pb-2 text-right">Ordered Qty</th>
              <th className="pb-2 text-right">Received Qty</th>
              <th className="pb-2 text-right">Unit Cost</th>
              <th className="pb-2 text-right">Total</th>
              {(isNew || order?.status === 'draft') && <th className="pb-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {lines.map((line, idx) => (
              <tr key={idx}>
                <td className="py-3">
                  {(isNew || order?.status === 'draft') ? (
                    <select
                      value={line.product_id}
                      onChange={(e) => updateLine(idx, 'product_id', e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 text-xs w-full"
                    >
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ) : (
                    <span className="text-slate-200">{line.product_name}</span>
                  )}
                </td>
                <td className="py-3 text-right">
                  {(isNew || order?.status === 'draft') ? (
                    <input
                      type="number"
                      min={1}
                      value={line.ordered_qty}
                      onChange={(e) => updateLine(idx, 'ordered_qty', e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 text-xs w-24 text-right"
                    />
                  ) : (
                    <span className="text-slate-200">{line.ordered_qty}</span>
                  )}
                </td>
                <td className="py-3 text-right text-slate-400">{line.received_qty}</td>
                <td className="py-3 text-right text-slate-300">${line.cost_price.toFixed(2)}</td>
                <td className="py-3 text-right text-white font-medium">${line.line_total.toFixed(2)}</td>
                {(isNew || order?.status === 'draft') && (
                  <td className="py-3 pl-3">
                    <button onClick={() => setLines((l) => l.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                  </td>
                )}
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">No lines added</td>
              </tr>
            )}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4} className="pt-3 text-right text-slate-400 font-medium">Total:</td>
                <td className="pt-3 text-right text-white font-bold">
                  ${lines.reduce((s, l) => s + l.line_total, 0).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        {isNew && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium hover:from-cyan-400 hover:to-blue-400 transition-all disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
        {isSystemAdmin && order?.status === 'draft' && (
          <button
            onClick={() => doAction(() => purchaseOrdersApi.confirm(order.id))}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
          >
            Confirm
          </button>
        )}
        {canReceive && (
          <button
            onClick={() => setShowReceiveModal(true)}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-colors"
          >
            Receive
          </button>
        )}
        {canCancel && !isNew && (
          <button
            onClick={() => doAction(() => purchaseOrdersApi.cancel(order!.id))}
            className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-colors"
          >
            Cancel Order
          </button>
        )}
      </div>

      {showReceiveModal && (
        <ReceiveModal
          lines={lines.filter((l) => l.received_qty < l.ordered_qty)}
          onClose={() => setShowReceiveModal(false)}
          onSubmit={handleReceive}
        />
      )}
    </div>
  );
}
