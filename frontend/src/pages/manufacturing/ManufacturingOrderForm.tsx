import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { manufacturingOrdersApi, bomsApi } from '../../api/manufacturing';
import { productsApi } from '../../api/purchase';
import type {
  ManufacturingOrder,
  BomOption,
  MoComponent,
  WorkOrder,
  MoComponentUpdate,
  WorkOrderUpdate,
} from '../../types/manufacturing';
import type { ProductBrief } from '../../types/purchase';
import { MO_STATUS_COLORS, MO_STATUS_LABELS } from '../../types/manufacturing';

export default function ManufacturingOrderForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [order, setOrder] = useState<ManufacturingOrder | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Header fields
  const [finishedProductId, setFinishedProductId] = useState('');
  const [bomId, setBomId] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [scheduledDate, setScheduledDate] = useState('');

  // Sub-table editable state
  const [components, setComponents] = useState<MoComponent[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);

  // Lookups
  const [products, setProducts] = useState<ProductBrief[]>([]);
  const [boms, setBoms] = useState<BomOption[]>([]);

  useEffect(() => {
    loadLookups();
    if (!isNew && id) loadOrder(id);
  }, [id]);

  const loadLookups = async () => {
    try {
      const [productsData, bomsData] = await Promise.all([
        productsApi.list(),
        bomsApi.listBrief(),
      ]);
      setProducts(productsData);
      setBoms(bomsData);
    } catch (err) {
      console.error('Failed to load lookups', err);
    }
  };

  const loadOrder = async (orderId: string) => {
    try {
      setLoading(true);
      const data = await manufacturingOrdersApi.get(orderId);
      setOrder(data);
      setFinishedProductId(data.finished_product.id);
      setBomId(data.bom_id || '');
      setQuantity(Number(data.quantity));
      setScheduledDate(data.scheduled_date || '');
      setComponents(data.components);
      setWorkOrders(data.work_orders);
    } catch (err) {
      setError('Failed to load manufacturing order');
    } finally {
      setLoading(false);
    }
  };

  const status = order?.status || 'draft';
  const isTerminal = status === 'done' || status === 'cancelled';
  const isHeaderLocked = status !== 'draft';
  const isSubEditable = status === 'confirmed' || status === 'in_progress';

  // ----- Header save (draft only) -----
  const handleSave = async () => {
    if (!finishedProductId) {
      setError('Please select a finished product');
      return;
    }
    if (quantity <= 0) {
      setError('Quantity must be greater than zero');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (isNew) {
        const created = await manufacturingOrdersApi.create({
          finished_product_id: finishedProductId,
          quantity,
          bom_id: bomId || undefined,
          scheduled_date: scheduledDate || undefined,
        });
        navigate(`/manufacturing/${created.id}`);
      } else if (order) {
        await manufacturingOrdersApi.update(order.id, {
          finished_product_id: finishedProductId,
          bom_id: bomId || undefined,
          quantity,
          scheduled_date: scheduledDate || undefined,
        });
        loadOrder(order.id);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save manufacturing order');
    } finally {
      setSaving(false);
    }
  };

  // ----- Save sub-table edits (confirmed / in_progress) -----
  const handleSaveSubTables = async () => {
    if (!order) return;
    setSaving(true);
    setError('');
    try {
      const compUpdates: MoComponentUpdate[] = components.map((c) => ({
        component_id: c.id,
        consumed_qty: Number(c.consumed_qty),
        batch_number: c.batch_number || undefined,
      }));
      const woUpdates: WorkOrderUpdate[] = workOrders.map((w) => ({
        work_order_id: w.id,
        real_duration_min: w.real_duration_min ?? undefined,
        pass_fail: w.pass_fail || undefined,
      }));

      await manufacturingOrdersApi.update(order.id, {
        components: compUpdates,
        work_orders: woUpdates,
      });
      loadOrder(order.id);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save updates');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!order) return;
    if (!confirm('Confirm this MO? Finished product and BoM will be locked.')) return;
    setSaving(true);
    try {
      await manufacturingOrdersApi.confirm(order.id);
      loadOrder(order.id);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to confirm');
    } finally {
      setSaving(false);
    }
  };

  const handleStart = async () => {
    if (!order) return;
    if (!confirm('Start production for this MO?')) return;
    setSaving(true);
    try {
      await manufacturingOrdersApi.start(order.id);
      loadOrder(order.id);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to start');
    } finally {
      setSaving(false);
    }
  };

  const handleProduce = async () => {
    if (!order) return;
    if (!confirm('Mark production as done? This will move stock (consume components and add finished product).')) return;
    setSaving(true);
    try {
      await manufacturingOrdersApi.produce(order.id);
      loadOrder(order.id);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to produce');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!order) return;
    if (!confirm('Cancel this MO?')) return;
    setSaving(true);
    try {
      await manufacturingOrdersApi.cancel(order.id);
      loadOrder(order.id);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to cancel');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!order) return;
    if (!confirm(`Delete ${order.reference}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await manufacturingOrdersApi.delete(order.id);
      navigate('/manufacturing');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete');
    } finally {
      setSaving(false);
    }
  };

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
            onClick={() => navigate('/manufacturing')}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {isNew ? 'New Manufacturing Order' : order?.reference}
            </h1>
            {order && (
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${MO_STATUS_COLORS[status]}`}>
                  {MO_STATUS_LABELS[status]}
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

        {/* Action buttons */}
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
                    Cancel
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
          {status === 'confirmed' && (
            <>
              <button
                onClick={handleSaveSubTables}
                disabled={saving}
                className="px-4 py-2 bg-slate-700 text-white rounded-xl font-medium hover:bg-slate-600 disabled:opacity-50"
              >
                Save Updates
              </button>
              <button
                onClick={handleStart}
                disabled={saving}
                className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium hover:from-cyan-400 hover:to-blue-400"
              >
                Start
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-4 py-2 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-400 disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          )}
          {status === 'in_progress' && (
            <>
              <button
                onClick={handleSaveSubTables}
                disabled={saving}
                className="px-4 py-2 bg-slate-700 text-white rounded-xl font-medium hover:bg-slate-600 disabled:opacity-50"
              >
                Save Updates
              </button>
              <button
                onClick={handleProduce}
                disabled={saving}
                className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-medium hover:from-emerald-400 hover:to-teal-400"
              >
                Produce (Done)
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-4 py-2 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-400 disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          )}
          {isTerminal && (
            <button
              onClick={() => navigate('/manufacturing')}
              className="px-4 py-2 bg-slate-700 text-white rounded-xl font-medium hover:bg-slate-600"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
          {error}
        </div>
      )}

      {/* Header form */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Finished Product *</label>
            <select
              value={finishedProductId}
              onChange={(e) => setFinishedProductId(e.target.value)}
              disabled={isHeaderLocked || isTerminal}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Select a product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {isHeaderLocked && !isNew && (
              <p className="text-xs text-slate-500 mt-1">Locked after confirmation</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Quantity *</label>
            <input
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value) || 0)}
              disabled={isHeaderLocked || isTerminal}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Bill of Materials</label>
            <select
              value={bomId}
              onChange={(e) => setBomId(e.target.value)}
              disabled={isHeaderLocked || isTerminal}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50"
            >
              <option value="">(none — components must be set manually)</option>
              {boms.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.reference}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              When set, components and work orders are auto-populated and scaled to quantity.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Scheduled Date</label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              disabled={isHeaderLocked || isTerminal}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Components Sub-table */}
        {!isNew && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-medium text-slate-400">Components</label>
              {isSubEditable && (
                <p className="text-xs text-slate-500">
                  Editable: Consumed Qty &amp; Batch Number
                </p>
              )}
            </div>
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-800/50">
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Component</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-slate-400 w-28">To Consume</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-slate-400 w-32">Consumed</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400 w-40">Batch #</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-slate-400 w-28">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {components.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        No components. Pick a BoM in draft to auto-populate, or add manually.
                      </td>
                    </tr>
                  ) : (
                    components.map((comp, idx) => {
                      const available = comp.free_to_use_qty;
                      const shortage =
                        available !== undefined && available !== null && Number(available) < Number(comp.to_consume);
                      return (
                        <tr key={comp.id} className="border-t border-slate-800/50">
                          <td className="px-4 py-3 text-slate-200">{comp.component_product_name}</td>
                          <td className="px-4 py-3 text-right text-slate-400">{comp.to_consume}</td>
                          <td className="px-4 py-3 text-right">
                            {isSubEditable ? (
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={comp.consumed_qty}
                                onChange={(e) => {
                                  const v = Number(e.target.value) || 0;
                                  const next = [...components];
                                  next[idx] = { ...comp, consumed_qty: v };
                                  setComponents(next);
                                }}
                                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-right focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                              />
                            ) : (
                              <span className="text-slate-200">{comp.consumed_qty}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isSubEditable ? (
                              <input
                                type="text"
                                value={comp.batch_number || ''}
                                onChange={(e) => {
                                  const next = [...components];
                                  next[idx] = { ...comp, batch_number: e.target.value };
                                  setComponents(next);
                                }}
                                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                              />
                            ) : (
                              <span className="text-slate-400">{comp.batch_number || '—'}</span>
                            )}
                          </td>
                          <td className={`px-4 py-3 text-right ${shortage ? 'text-amber-400' : 'text-slate-400'}`}>
                            {available ?? '—'}
                            {shortage && <span className="ml-1">⚠️</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Work Orders Sub-table */}
        {!isNew && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-medium text-slate-400">Work Orders</label>
              {isSubEditable && (
                <p className="text-xs text-slate-500">
                  Editable: Real Duration &amp; Pass/Fail
                </p>
              )}
            </div>
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-800/50">
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400 w-16">Seq</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Operation</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Work Center</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-slate-400 w-32">Expected (min)</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-slate-400 w-32">Real (min)</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400 w-32">Pass/Fail</th>
                  </tr>
                </thead>
                <tbody>
                  {workOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        No work orders. Pick a BoM in draft to auto-populate.
                      </td>
                    </tr>
                  ) : (
                    workOrders.map((wo, idx) => (
                      <tr key={wo.id} className="border-t border-slate-800/50">
                        <td className="px-4 py-3 text-slate-400">{wo.sequence}</td>
                        <td className="px-4 py-3 text-slate-200">{wo.operation_name}</td>
                        <td className="px-4 py-3 text-slate-400">{wo.work_center}</td>
                        <td className="px-4 py-3 text-right text-slate-400">{wo.expected_duration_min}</td>
                        <td className="px-4 py-3 text-right">
                          {isSubEditable ? (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={wo.real_duration_min ?? ''}
                              onChange={(e) => {
                                const next = [...workOrders];
                                const v = e.target.value === '' ? undefined : Number(e.target.value);
                                next[idx] = { ...wo, real_duration_min: v };
                                setWorkOrders(next);
                              }}
                              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-right focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                            />
                          ) : (
                            <span className="text-slate-200">{wo.real_duration_min ?? '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isSubEditable ? (
                            <select
                              value={wo.pass_fail || ''}
                              onChange={(e) => {
                                const next = [...workOrders];
                                next[idx] = { ...wo, pass_fail: e.target.value || undefined };
                                setWorkOrders(next);
                              }}
                              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                            >
                              <option value="">—</option>
                              <option value="pass">Pass</option>
                              <option value="fail">Fail</option>
                            </select>
                          ) : (
                            <span className="text-slate-400">{wo.pass_fail || '—'}</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
