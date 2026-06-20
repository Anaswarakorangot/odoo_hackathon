import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { purchaseOrdersApi, vendorsApi, productsApi } from '../../api/purchase';
import type { PurchaseOrder, Vendor, ProductBrief, PurchaseOrderLineCreate } from '../../types/purchase';
import { STATUS_COLORS, STATUS_LABELS } from '../../types/purchase';
import ReceiveModal from './ReceiveModal';

interface LineItem {
  id?: string;
  product_id: string;
  product_name: string;
  ordered_qty: number;
  received_qty: number;
  cost_price: number;
  line_total: number;
}

export default function PurchaseOrderForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [vendorId, setVendorId] = useState('');
  const [responsiblePersonId, setResponsiblePersonId] = useState('');
  const [lines, setLines] = useState<LineItem[]>([]);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<ProductBrief[]>([]);

  const [showReceiveModal, setShowReceiveModal] = useState(false);

  useEffect(() => {
    loadLookups();
    if (!isNew && id) {
      loadOrder(id);
    }
  }, [id]);

  const loadLookups = async () => {
    try {
      const [vendorsData, productsData] = await Promise.all([
        vendorsApi.list(),
        productsApi.list(),
      ]);
      setVendors(vendorsData);
      setProducts(productsData);
    } catch (err) {
      console.error('Failed to load lookups', err);
    }
  };

  const loadOrder = async (orderId: string) => {
    try {
      setLoading(true);
      const data = await purchaseOrdersApi.get(orderId);
      setOrder(data);
      setVendorId(data.vendor.id);
      setResponsiblePersonId(data.responsible_person?.id || '');
      setLines(
        data.lines.map((line) => ({
          id: line.id,
          product_id: line.product_id,
          product_name: line.product_name,
          ordered_qty: line.ordered_qty,
          received_qty: line.received_qty,
          cost_price: line.cost_price,
          line_total: line.line_total,
        }))
      );
    } catch (err) {
      setError('Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  const addLine = () => {
    if (products.length === 0) return;
    const product = products[0];
    setLines([
      ...lines,
      {
        product_id: product.id,
        product_name: product.name,
        ordered_qty: 1,
        received_qty: 0,
        cost_price: product.cost_price,
        line_total: product.cost_price,
      },
    ]);
  };

  const updateLine = (index: number, field: keyof LineItem, value: any) => {
    const newLines = [...lines];
    const line = { ...newLines[index] };

    if (field === 'product_id') {
      const product = products.find((p) => p.id === value);
      if (product) {
        line.product_id = product.id;
        line.product_name = product.name;
        line.cost_price = product.cost_price;
        line.line_total = line.ordered_qty * product.cost_price;
      }
    } else if (field === 'ordered_qty') {
      line.ordered_qty = Number(value) || 0;
      line.line_total = line.ordered_qty * line.cost_price;
    } else {
      (line as any)[field] = value;
    }

    newLines[index] = line;
    setLines(newLines);
  };

  const removeLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  const totalAmount = lines.reduce((sum, line) => sum + line.line_total, 0);

  const handleSave = async () => {
    if (!vendorId) {
      setError('Please select a vendor');
      return;
    }
    if (lines.length === 0) {
      setError('Please add at least one line item');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const lineItems: PurchaseOrderLineCreate[] = lines.map((line) => ({
        product_id: line.product_id,
        ordered_qty: line.ordered_qty,
      }));

      if (isNew) {
        const newOrder = await purchaseOrdersApi.create({
          vendor_id: vendorId,
          responsible_person_id: responsiblePersonId || undefined,
          line_items: lineItems,
        });
        navigate(`/purchase/${newOrder.id}`);
      } else if (order) {
        await purchaseOrdersApi.update(order.id, {
          vendor_id: vendorId,
          responsible_person_id: responsiblePersonId || undefined,
          lines: lines.map((line) => ({
            id: line.id,
            product_id: line.product_id,
            ordered_qty: line.ordered_qty,
          })),
        } as any);
        loadOrder(order.id);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save order');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!order) return;
    if (!confirm('Confirm this order? Vendor and line fields will be locked.')) return;

    setSaving(true);
    try {
      await purchaseOrdersApi.confirm(order.id);
      loadOrder(order.id);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to confirm order');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!order) return;
    if (!confirm('Cancel this order?')) return;

    setSaving(true);
    try {
      await purchaseOrdersApi.cancel(order.id);
      loadOrder(order.id);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to cancel order');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!order) return;
    if (!confirm(`Delete ${order.reference}? This cannot be undone.`)) return;

    setSaving(true);
    try {
      await purchaseOrdersApi.delete(order.id);
      navigate('/purchase');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete order');
    } finally {
      setSaving(false);
    }
  };

  const handleReceiveComplete = () => {
    setShowReceiveModal(false);
    if (order) loadOrder(order.id);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const status = order?.status || 'draft';
  const isReadonly = status === 'fully_received' || status === 'cancelled';
  const isVendorLocked = status !== 'draft';
  const isLinesLocked = status !== 'draft';

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/purchase')}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {isNew ? 'New Purchase Order' : order?.reference}
            </h1>
            {order && (
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
                  {STATUS_LABELS[status]}
                </span>
                {order.auto_created && order.source_sales_order_ref && (
                  <span className="text-xs text-slate-400">
                    Auto-created from {order.source_sales_order_ref}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {status === 'draft' && (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium hover:from-cyan-400 hover:to-blue-400 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              {!isNew && (
                <>
                  <button
                    onClick={handleConfirm}
                    disabled={saving}
                    className="px-4 py-2 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-400 disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={saving}
                    className="px-4 py-2 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-400 disabled:opacity-50"
                  >
                    Cancel Order
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="px-4 py-2 bg-red-500 text-white rounded-xl font-medium hover:bg-red-400 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </>
              )}
            </>
          )}
          {(status === 'confirmed' || status === 'partially_received') && (
            <>
              <button
                onClick={() => setShowReceiveModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium hover:from-cyan-400 hover:to-blue-400"
              >
                Receive
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-4 py-2 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-400 disabled:opacity-50"
              >
                Cancel Order
              </button>
            </>
          )}
          {isReadonly && (
            <button
              onClick={() => navigate('/purchase')}
              className="px-4 py-2 bg-slate-700 text-white rounded-xl font-medium hover:bg-slate-600"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
          {error}
        </div>
      )}

      {/* Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
        {/* Vendor Selection */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Vendor *</label>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              disabled={isVendorLocked || isReadonly}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Select a vendor</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            {isVendorLocked && !isNew && (
              <p className="text-xs text-slate-500 mt-1">Locked after confirmation</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Vendor Address</label>
            <input
              type="text"
              value={order?.vendor_address || ''}
              disabled
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-400 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Lines Table */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <label className="text-sm font-medium text-slate-400">Order Lines</label>
            {!isLinesLocked && !isReadonly && (
              <button
                onClick={addLine}
                className="px-3 py-1.5 text-sm bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700"
              >
                + Add Line
              </button>
            )}
          </div>

          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Product</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-slate-400 w-28">Ordered</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-slate-400 w-28">Received</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-slate-400 w-32">Cost Price</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-slate-400 w-32">Total</th>
                  {!isLinesLocked && !isReadonly && (
                    <th className="px-4 py-3 w-16"></th>
                  )}
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No line items. Click "Add Line" to add products.
                    </td>
                  </tr>
                ) : (
                  lines.map((line, index) => (
                    <tr key={index} className="border-t border-slate-800/50">
                      <td className="px-4 py-3">
                        {!isLinesLocked && !isReadonly ? (
                          <select
                            value={line.product_id}
                            onChange={(e) => updateLine(index, 'product_id', e.target.value)}
                            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                          >
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-200">{line.product_name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isLinesLocked && !isReadonly ? (
                          <input
                            type="number"
                            value={line.ordered_qty}
                            onChange={(e) => updateLine(index, 'ordered_qty', e.target.value)}
                            min="1"
                            step="1"
                            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-right focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                          />
                        ) : (
                          <span className="text-slate-200">{line.ordered_qty}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400">{line.received_qty}</td>
                      <td className="px-4 py-3 text-right text-slate-400">
                        {formatCurrency(line.cost_price)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-white">
                        {formatCurrency(line.line_total)}
                      </td>
                      {!isLinesLocked && !isReadonly && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => removeLine(index)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-700 bg-slate-800/30">
                  <td colSpan={4} className="px-4 py-4 text-right font-medium text-slate-300">
                    Order Total:
                  </td>
                  <td className="px-4 py-4 text-right text-xl font-bold text-cyan-400">
                    {formatCurrency(totalAmount)}
                  </td>
                  {!isLinesLocked && !isReadonly && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Receive Modal */}
      {showReceiveModal && order && (
        <ReceiveModal
          order={order}
          onClose={() => setShowReceiveModal(false)}
          onComplete={handleReceiveComplete}
        />
      )}
    </div>
  );
}
