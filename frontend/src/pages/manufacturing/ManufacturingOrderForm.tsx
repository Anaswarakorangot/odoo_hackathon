import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { manufacturingOrdersApi, productsForMoApi, bomsApi } from '../../api/manufacturing';
import { usersApi } from '../../api/users';
import type { ManufacturingOrder } from '../../types/manufacturing';
import { MO_STATUS_COLORS, MO_STATUS_LABELS } from '../../types/manufacturing';
import { useAuth } from '../../contexts/AuthContext';

interface ProductLookup {
  id: string;
  name: string;
  product_type: string;
}

interface BomLookup {
  id: string;
  reference: string;
  finished_product_id: string;
  finished_product_name: string;
}

interface UserLookup {
  id: string;
  name: string;
}

export default function ManufacturingOrderForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isSystemAdmin } = useAuth();
  const isNew = !id || id === 'new';

  const [order, setOrder] = useState<ManufacturingOrder | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  // Form State
  const [finishedProductId, setFinishedProductId] = useState('');
  const [bomId, setBomId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [assigneeId, setAssigneeId] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');

  // Tables state (for confirmed / in-progress edit mode)
  const [components, setComponents] = useState<
    { id: string; name: string; toConsume: number; consumedQty: number; batchNumber: string; freeToUseQty?: number }[]
  >([]);
  const [workOrders, setWorkOrders] = useState<
    { id: string; sequence: number; operationName: string; workCenter: string; expectedDuration: number; realDuration: number; passFail: string }[]
  >([]);

  // Lookups
  const [products, setProducts] = useState<ProductLookup[]>([]);
  const [boms, setBoms] = useState<BomLookup[]>([]);
  const [users, setUsers] = useState<UserLookup[]>([]);

  useEffect(() => {
    loadLookups();
  }, []);

  useEffect(() => {
    if (!isNew && id) {
      loadOrder(id);
    }
  }, [id]);

  const loadLookups = async () => {
    try {
      const [prodData, bomData] = await Promise.all([
        productsForMoApi.list(),
        bomsApi.list(),
      ]);
      setProducts(prodData);
      setBoms(bomData);

      // Try fetching users for assignee selection
      try {
        const userData = await usersApi.list();
        setUsers(userData);
      } catch {
        // Silent catch for non-admin users
      }
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
      setAssigneeId(data.assignee?.id || '');
      setScheduledDate(data.scheduled_date || '');

      setComponents(
        data.components.map((c) => ({
          id: c.id,
          name: c.component_product_name,
          toConsume: Number(c.to_consume),
          consumedQty: Number(c.consumed_qty),
          batchNumber: c.batch_number || '',
          freeToUseQty: c.free_to_use_qty !== null && c.free_to_use_qty !== undefined ? Number(c.free_to_use_qty) : undefined,
        }))
      );

      setWorkOrders(
        data.work_orders.map((w) => ({
          id: w.id,
          sequence: w.sequence,
          operationName: w.operation_name,
          workCenter: w.work_center,
          expectedDuration: w.expected_duration_min,
          realDuration: w.real_duration_min || 0,
          passFail: w.pass_fail || '',
        }))
      );

      // If user list is empty (because non-admin), populate it with assignee to keep dropdown valid
      if (data.assignee && users.length === 0) {
        setUsers([data.assignee]);
      }
    } catch (err) {
      setError('Failed to load manufacturing order');
    } finally {
      setLoading(false);
    }
  };

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
    setActionError('');

    try {
      if (isNew) {
        const created = await manufacturingOrdersApi.create({
          finished_product_id: finishedProductId,
          quantity,
          bom_id: bomId || undefined,
          assignee_id: assigneeId || undefined,
          scheduled_date: scheduledDate || undefined,
        });
        navigate(`/manufacturing/${created.id}`);
      } else if (order) {
        // Edit mode (Draft header fields OR components/work orders)
        if (order.status === 'draft') {
          const updated = await manufacturingOrdersApi.update(order.id, {
            finished_product_id: finishedProductId,
            bom_id: bomId || undefined,
            quantity,
            assignee_id: assigneeId || undefined,
            scheduled_date: scheduledDate || undefined,
          });
          setOrder(updated);
          loadOrder(updated.id);
        } else {
          // Confirmed / In Progress edit mode
          const updated = await manufacturingOrdersApi.update(order.id, {
            components: components.map((c) => ({
              component_id: c.id,
              consumed_qty: c.consumedQty,
              batch_number: c.batchNumber || undefined,
            })),
            work_orders: workOrders.map((w) => ({
              work_order_id: w.id,
              real_duration_min: w.realDuration,
              pass_fail: w.passFail || undefined,
            })),
          });
          setOrder(updated);
          loadOrder(updated.id);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save manufacturing order');
    } finally {
      setSaving(false);
    }
  };

  const doAction = async (action: () => Promise<any>) => {
    setActionError('');
    setError('');
    try {
      await action();
      if (id) loadOrder(id);
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Action failed');
    }
  };

  const handleBomChange = (selectedBomId: string) => {
    setBomId(selectedBomId);
    if (selectedBomId) {
      const selectedBom = boms.find((b) => b.id === selectedBomId);
      if (selectedBom) {
        setFinishedProductId(selectedBom.finished_product_id);
      }
    }
  };

  const updateComponentQty = (idx: number, val: number) => {
    setComponents((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, consumedQty: val } : c))
    );
  };

  const updateComponentBatch = (idx: number, val: string) => {
    setComponents((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, batchNumber: val } : c))
    );
  };

  const updateWorkOrderDuration = (idx: number, val: number) => {
    setWorkOrders((prev) =>
      prev.map((w, i) => (i === idx ? { ...w, realDuration: val } : w))
    );
  };

  const updateWorkOrderPassFail = (idx: number, val: string) => {
    setWorkOrders((prev) =>
      prev.map((w, i) => (i === idx ? { ...w, passFail: val } : w))
    );
  };

  const status = order?.status || 'draft';
  const isDraft = status === 'draft';
  const isTerminal = status === 'done' || status === 'cancelled';
  const isEditable = !isTerminal;

  // Filtered BOMs based on finished product
  const filteredBoms = finishedProductId
    ? boms.filter((b) => b.finished_product_id === finishedProductId)
    : boms;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back and Title */}
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
              <span
                className={`mt-1.5 inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                  MO_STATUS_COLORS[status]
                }`}
              >
                {MO_STATUS_LABELS[status]}
              </span>
            )}
          </div>
        </div>

        {/* Status transition actions */}
        <div className="flex gap-2">
          {isEditable && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-xl font-medium hover:from-violet-400 hover:to-purple-400 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}

          {isSystemAdmin && status === 'draft' && !isNew && (
            <button
              onClick={() => doAction(() => manufacturingOrdersApi.confirm(order!.id))}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
            >
              Confirm
            </button>
          )}

          {status === 'confirmed' && (
            <button
              onClick={() => doAction(() => manufacturingOrdersApi.start(order!.id))}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-medium transition-colors"
            >
              Start Production
            </button>
          )}

          {status === 'in_progress' && (
            <button
              onClick={() => doAction(() => manufacturingOrdersApi.produce(order!.id))}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-colors"
            >
              Produce (Mark Done)
            </button>
          )}

          {isEditable && !isNew && (
            <button
              onClick={() => doAction(() => manufacturingOrdersApi.cancel(order!.id))}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition-colors"
            >
              Cancel Order
            </button>
          )}
        </div>
      </div>

      {/* Auto-created banner */}
      {order?.auto_created && order.source_sales_order_ref && (
        <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl text-purple-300 text-sm">
          🔗 Auto-created from Sales Order <strong>{order.source_sales_order_ref}</strong>
        </div>
      )}

      {/* Errors */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          ⚠️ {error}
        </div>
      )}
      {actionError && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          ⚠️ {actionError}
        </div>
      )}

      {/* Main Form Fields */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
        <h2 className="text-lg font-semibold text-white">Order Specification</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Finished Product */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Finished Product *</label>
            <select
              value={finishedProductId}
              onChange={(e) => setFinishedProductId(e.target.value)}
              disabled={!isDraft}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-50"
            >
              <option value="">Select a product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Bill of Materials */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Bill of Materials</label>
            <select
              value={bomId}
              onChange={(e) => handleBomChange(e.target.value)}
              disabled={!isDraft}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-50"
            >
              <option value="">Select BoM...</option>
              {filteredBoms.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.reference} ({b.finished_product_name})
                </option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Quantity *</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value) || 0)}
              disabled={!isDraft}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-50"
            />
          </div>

          {/* Assignee */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Assignee</label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={!isDraft}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-50"
            >
              <option value="">Select assignee...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {/* Scheduled Date */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Scheduled Date</label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              disabled={!isDraft}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-50"
            />
          </div>
        </div>
      </div>

      {/* Components Sub-table */}
      {!isNew && components.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Component Requirements</h2>
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/50 text-left text-slate-400 border-b border-slate-800">
                  <th className="px-4 py-3 font-semibold">Component Product</th>
                  <th className="px-4 py-3 font-semibold text-right w-36">To Consume</th>
                  <th className="px-4 py-3 font-semibold text-right w-40">Consumed Qty</th>
                  <th className="px-4 py-3 font-semibold w-48">Batch Number</th>
                  <th className="px-4 py-3 font-semibold text-center w-36">Availability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {components.map((comp, idx) => {
                  const isCompEditable = ['confirmed', 'in_progress'].includes(status);
                  const isAvailable =
                    comp.freeToUseQty !== undefined && comp.freeToUseQty >= comp.toConsume;

                  return (
                    <tr key={comp.id} className="hover:bg-slate-950/20">
                      <td className="px-4 py-3 text-slate-200 font-medium">{comp.name}</td>
                      <td className="px-4 py-3 text-right text-slate-300 font-mono">{comp.toConsume}</td>
                      <td className="px-4 py-3 text-right">
                        {isCompEditable ? (
                          <input
                            type="number"
                            min={0}
                            value={comp.consumedQty}
                            onChange={(e) => updateComponentQty(idx, Number(e.target.value) || 0)}
                            className="w-28 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 text-right focus:outline-none focus:ring-1 focus:ring-violet-500"
                          />
                        ) : (
                          <span className="text-slate-400 font-mono">{comp.consumedQty}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isCompEditable ? (
                          <input
                            type="text"
                            placeholder="Enter batch..."
                            value={comp.batchNumber}
                            onChange={(e) => updateComponentBatch(idx, e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
                          />
                        ) : (
                          <span className="text-slate-400 font-mono">{comp.batchNumber || '-'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {comp.freeToUseQty !== undefined ? (
                          isAvailable ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Available ({comp.freeToUseQty})
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              Short ({comp.freeToUseQty})
                            </span>
                          )
                        ) : (
                          <span className="text-slate-500 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Work Orders Sub-table */}
      {!isNew && workOrders.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Work Orders</h2>
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/50 text-left text-slate-400 border-b border-slate-800">
                  <th className="px-4 py-3 font-semibold w-16 text-center">Seq</th>
                  <th className="px-4 py-3 font-semibold">Operation Name</th>
                  <th className="px-4 py-3 font-semibold">Work Center</th>
                  <th className="px-4 py-3 font-semibold text-right w-44">Expected (min)</th>
                  {status !== 'draft' && (
                    <>
                      <th className="px-4 py-3 font-semibold text-right w-44">Real Duration (min)</th>
                      <th className="px-4 py-3 font-semibold text-center w-36">Result</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {workOrders.map((wo, idx) => {
                  const isWoEditable = ['confirmed', 'in_progress'].includes(status);
                  return (
                    <tr key={wo.id} className="hover:bg-slate-950/20">
                      <td className="px-4 py-3 text-center text-slate-500 font-mono">{wo.sequence}</td>
                      <td className="px-4 py-3 text-slate-200 font-medium">{wo.operationName}</td>
                      <td className="px-4 py-3 text-slate-300">{wo.workCenter}</td>
                      <td className="px-4 py-3 text-right text-slate-400 font-mono">{wo.expectedDuration}</td>
                      {status !== 'draft' && (
                        <>
                          <td className="px-4 py-3 text-right">
                            {isWoEditable ? (
                              <input
                                type="number"
                                min={0}
                                value={wo.realDuration}
                                onChange={(e) => updateWorkOrderDuration(idx, Number(e.target.value) || 0)}
                                className="w-28 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 text-right focus:outline-none focus:ring-1 focus:ring-violet-500"
                              />
                            ) : (
                              <span className="text-slate-400 font-mono">{wo.realDuration}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isWoEditable ? (
                              <select
                                value={wo.passFail}
                                onChange={(e) => updateWorkOrderPassFail(idx, e.target.value)}
                                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
                              >
                                <option value="">Select...</option>
                                <option value="pass">Pass</option>
                                <option value="fail">Fail</option>
                              </select>
                            ) : (
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                  wo.passFail === 'pass'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : wo.passFail === 'fail'
                                    ? 'bg-red-500/10 text-red-400'
                                    : 'bg-slate-800 text-slate-500'
                                }`}
                              >
                                {wo.passFail ? wo.passFail.toUpperCase() : 'PENDING'}
                              </span>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
