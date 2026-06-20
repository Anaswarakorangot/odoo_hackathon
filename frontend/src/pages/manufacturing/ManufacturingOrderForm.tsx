import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { bomsApi, manufacturingOrdersApi, productsForMoApi } from '../../api/manufacturing';
import { usersApi } from '../../api/users';
import type { ManufacturingOrder } from '../../types/manufacturing';
import { MO_STATUS_COLORS, MO_STATUS_LABELS } from '../../types/manufacturing';

type ProductLookup = { id: string; name: string; product_type: string };
type BomLookup = { id: string; reference: string; finished_product_id: string; finished_product_name: string };
type UserLookup = { id: string; name: string };
type ComponentRow = { id: string; name: string; toConsume: number; consumedQty: number; batchNumber: string; freeToUseQty?: number };
type WorkOrderRow = { id: string; sequence: number; operationName: string; workCenter: string; expectedDuration: number; realDuration: number; passFail: string };

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

  const [finishedProductId, setFinishedProductId] = useState('');
  const [bomId, setBomId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [assigneeId, setAssigneeId] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');

  const [components, setComponents] = useState<ComponentRow[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([]);
  const [products, setProducts] = useState<ProductLookup[]>([]);
  const [boms, setBoms] = useState<BomLookup[]>([]);
  const [users, setUsers] = useState<UserLookup[]>([]);

  useEffect(() => {
    loadLookups();
    if (!isNew && id) loadOrder(id);
  }, [id]);

  const loadLookups = async () => {
    try {
      const [productData, bomData] = await Promise.all([productsForMoApi.list(), bomsApi.list()]);
      setProducts(productData);
      setBoms(bomData);
      try {
        setUsers(await usersApi.list());
      } catch {
        // ignore for restricted users
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
      setComponents(data.components.map((component) => ({ id: component.id, name: component.component_product_name, toConsume: Number(component.to_consume), consumedQty: Number(component.consumed_qty), batchNumber: component.batch_number || '', freeToUseQty: component.free_to_use_qty !== null && component.free_to_use_qty !== undefined ? Number(component.free_to_use_qty) : undefined })));
      setWorkOrders(data.work_orders.map((workOrder) => ({ id: workOrder.id, sequence: workOrder.sequence, operationName: workOrder.operation_name, workCenter: workOrder.work_center, expectedDuration: workOrder.expected_duration_min, realDuration: workOrder.real_duration_min || 0, passFail: workOrder.pass_fail || '' })));
    } catch {
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
        const created = await manufacturingOrdersApi.create({ finished_product_id: finishedProductId, quantity, bom_id: bomId || undefined, assignee_id: assigneeId || undefined, scheduled_date: scheduledDate || undefined });
        navigate(`/manufacturing/${created.id}`);
      } else if (order) {
        const updated = await manufacturingOrdersApi.update(order.id, { finished_product_id: finishedProductId, bom_id: bomId || undefined, quantity, assignee_id: assigneeId || undefined, scheduled_date: scheduledDate || undefined, components: components.map((component) => ({ component_id: component.id, consumed_qty: component.consumedQty, batch_number: component.batchNumber || undefined })), work_orders: workOrders.map((workOrder) => ({ work_order_id: workOrder.id, real_duration_min: workOrder.realDuration, pass_fail: workOrder.passFail || undefined })) });
        setOrder(updated);
        await loadOrder(updated.id);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save manufacturing order');
    } finally {
      setSaving(false);
    }
  };

  const doAction = async (action: () => Promise<ManufacturingOrder>) => {
    setActionError('');
    try {
      const updated = await action();
      setOrder(updated);
      await loadOrder(updated.id);
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Action failed');
    }
  };

  const handleBomChange = async (selectedBomId: string) => {
    setBomId(selectedBomId);
    if (!selectedBomId) return;
    const selectedBom = boms.find((bom) => bom.id === selectedBomId);
    if (selectedBom) setFinishedProductId(selectedBom.finished_product_id);

    try {
      const bomDetails = await bomsApi.get(selectedBomId);
      setComponents(bomDetails.bom_lines.map((l) => ({
        id: crypto.randomUUID(),
        name: products.find(p => p.id === l.component_product_id)?.name || 'Unknown',
        toConsume: Number(l.qty_per_unit) * quantity,
        consumedQty: 0,
        batchNumber: '',
        freeToUseQty: undefined
      })));
      setWorkOrders(bomDetails.bom_operations.map((o) => ({
        id: crypto.randomUUID(),
        sequence: o.sequence,
        operationName: o.operation_name,
        workCenter: o.work_center,
        expectedDuration: o.expected_duration_min,
        realDuration: 0,
        passFail: ''
      })));
    } catch (e) {
      console.error(e);
    }
  };

  const status = order?.status || 'draft';
  const isDraft = status === 'draft';
  const isTerminal = status === 'done' || status === 'cancelled';
  const filteredBoms = finishedProductId ? boms.filter((bom) => bom.finished_product_id === finishedProductId) : boms;

  const getFieldLockState = (status: string, fieldName: string) => {
    if (status === 'done' || status === 'cancelled') return true;
    if (status !== 'draft' && ['finished_product_id', 'bom_id', 'quantity', 'assignee_id', 'scheduled_date'].includes(fieldName)) return true;
    return false;
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" /></div>;
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/manufacturing')} className="rounded-lg p-2 transition-colors hover:bg-slate-800"><span className="text-slate-400">←</span></button>
          <div>
            <h1 className="text-2xl font-bold text-white">{isNew ? 'New Manufacturing Order' : order?.reference}</h1>
            {order && <span className={`mt-1.5 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${MO_STATUS_COLORS[status]}`}>{MO_STATUS_LABELS[status]}</span>}
          </div>
        </div>

        <div className="flex gap-2">
          {!isTerminal && <button onClick={handleSave} disabled={saving} className="rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-4 py-2 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>}
          {isSystemAdmin && status === 'draft' && !isNew && <button onClick={() => doAction(() => manufacturingOrdersApi.confirm(order!.id))} className="rounded-xl bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-500">Confirm</button>}
          {status === 'confirmed' && <button onClick={() => doAction(() => manufacturingOrdersApi.start(order!.id))} className="rounded-xl bg-violet-600 px-4 py-2 text-white transition-colors hover:bg-violet-500">Start Production</button>}
          {status === 'in_progress' && <button onClick={() => doAction(() => manufacturingOrdersApi.produce(order!.id))} className="rounded-xl bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-500">Produce (Mark Done)</button>}
          {!isTerminal && !isNew && <button onClick={() => doAction(() => manufacturingOrdersApi.cancel(order!.id))} className="rounded-xl bg-slate-800 px-4 py-2 text-slate-300 transition-colors hover:bg-slate-700">Cancel Order</button>}
        </div>
      </div>

      {order?.auto_created && order.source_sales_order_ref && <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3 text-sm text-purple-300">🔗 Auto-created from Sales Order <strong>{order.source_sales_order_ref}</strong></div>}
      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">⚠️ {error}</div>}
      {actionError && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">⚠️ {actionError}</div>}

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-white">Order Specification</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-400">Finished Product *</label>
            <select value={finishedProductId} onChange={(e) => setFinishedProductId(e.target.value)} disabled={getFieldLockState(status, 'finished_product_id')} className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-slate-200 disabled:opacity-50">
              <option value="">Select a product</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-400">Bill of Materials</label>
            <select value={bomId} onChange={(e) => handleBomChange(e.target.value)} disabled={getFieldLockState(status, 'bom_id')} className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-slate-200 disabled:opacity-50">
              <option value="">Select BoM...</option>
              {filteredBoms.map((bom) => <option key={bom.id} value={bom.id}>{bom.reference} ({bom.finished_product_name})</option>)}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-400">Quantity *</label>
            <input type="number" min={1} value={quantity} onChange={(e) => {
              const newQty = Number(e.target.value) || 0;
              setQuantity(newQty);
              if (isDraft && order === null && components.length > 0) {
                 setComponents(current => current.map(c => ({...c, toConsume: (c.toConsume / quantity) * newQty})));
              }
            }} disabled={getFieldLockState(status, 'quantity')} className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-slate-200 disabled:opacity-50" />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-400">Assignee</label>
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} disabled={getFieldLockState(status, 'assignee_id')} className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-slate-200 disabled:opacity-50">
              <option value="">Select assignee...</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-400">Scheduled Date</label>
            <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} disabled={getFieldLockState(status, 'scheduled_date')} className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-slate-200 disabled:opacity-50" />
          </div>
        </div>
      </div>

      {!isNew && (
        <>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Components</h2>
              <span className="text-xs text-slate-500">Editable: Consumed Qty &amp; Batch Number</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-800">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-800/50">
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Component</th>
                    <th className="w-28 px-4 py-3 text-right text-sm font-medium text-slate-400">To Consume</th>
                    <th className="w-32 px-4 py-3 text-right text-sm font-medium text-slate-400">Consumed</th>
                    <th className="w-40 px-4 py-3 text-left text-sm font-medium text-slate-400">Batch #</th>
                    <th className="w-32 px-4 py-3 text-right text-sm font-medium text-slate-400">Availability</th>
                  </tr>
                </thead>
                <tbody>
                  {components.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No components loaded</td></tr>
                  ) : (
                    components.map((component, index) => {
                      const available = component.freeToUseQty;
                      const shortage = available !== undefined && Number(available) < Number(component.toConsume);
                      return (
                        <tr key={component.id} className="border-t border-slate-800/50">
                          <td className="px-4 py-3 text-slate-200">{component.name}</td>
                          <td className="px-4 py-3 text-right text-slate-400">{component.toConsume}</td>
                          <td className="px-4 py-3 text-right">
                            <input type="number" min={0} step="any" value={component.consumedQty} onChange={(e) => setComponents((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, consumedQty: Number(e.target.value) || 0 } : row)))} className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-right text-slate-200" />
                          </td>
                          <td className="px-4 py-3">
                            <input type="text" value={component.batchNumber} onChange={(e) => setComponents((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, batchNumber: e.target.value } : row)))} disabled={isTerminal} className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-slate-200 disabled:opacity-50" />
                          </td>
                          <td className="px-4 py-3 text-right">
                            {shortage ? (
                              <span className="inline-block rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-400 border border-amber-500/20">Shortage ({available ?? '?'})</span>
                            ) : (
                              <span className="inline-block rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-emerald-400 border border-emerald-500/20">Available ({available ?? '?'})</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Work Orders</h2>
              <span className="text-xs text-slate-500">Editable: Real Duration &amp; Pass/Fail</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-800">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-800/50">
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Operation</th>
                    <th className="w-24 px-4 py-3 text-right text-sm font-medium text-slate-400">Seq</th>
                    <th className="w-32 px-4 py-3 text-right text-sm font-medium text-slate-400">Expected</th>
                    {!isDraft && <th className="w-32 px-4 py-3 text-right text-sm font-medium text-slate-400">Actual</th>}
                    <th className="w-28 px-4 py-3 text-left text-sm font-medium text-slate-400">Pass/Fail</th>
                  </tr>
                </thead>
                <tbody>
                  {workOrders.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No work orders loaded</td></tr>
                  ) : (
                    workOrders.map((workOrder, index) => (
                      <tr key={workOrder.id} className="border-t border-slate-800/50">
                        <td className="px-4 py-3 text-slate-200">{workOrder.operationName}</td>
                        <td className="px-4 py-3 text-right text-slate-400">{workOrder.sequence}</td>
                        <td className="px-4 py-3 text-right text-slate-400">{workOrder.expectedDuration}</td>
                        {!isDraft && (
                          <td className="px-4 py-3 text-right">
                            <input type="number" min={0} step="any" value={workOrder.realDuration} onChange={(e) => setWorkOrders((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, realDuration: Number(e.target.value) || 0 } : row)))} disabled={isTerminal} className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-right text-slate-200 disabled:opacity-50" />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <input type="text" value={workOrder.passFail} onChange={(e) => setWorkOrders((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, passFail: e.target.value } : row)))} disabled={isTerminal} className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-slate-200 disabled:opacity-50" />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {order?.auto_created && order.source_sales_order_ref && <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3 text-sm text-purple-300">🔗 Auto-created from Sales Order <strong>{order.source_sales_order_ref}</strong></div>}

      <div className="flex flex-wrap gap-2">
        {!isTerminal && <button onClick={handleSave} disabled={saving} className="rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-4 py-2 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>}
        {isSystemAdmin && status === 'draft' && !isNew && <button onClick={() => doAction(() => manufacturingOrdersApi.confirm(order!.id))} className="rounded-xl bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-500">Confirm</button>}
        {status === 'confirmed' && <button onClick={() => doAction(() => manufacturingOrdersApi.start(order!.id))} className="rounded-xl bg-violet-600 px-4 py-2 text-white transition-colors hover:bg-violet-500">Start Production</button>}
        {status === 'in_progress' && <button onClick={() => doAction(() => manufacturingOrdersApi.produce(order!.id))} className="rounded-xl bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-500">Produce (Mark Done)</button>}
        {!isTerminal && !isNew && <button onClick={() => doAction(() => manufacturingOrdersApi.cancel(order!.id))} className="rounded-xl bg-slate-800 px-4 py-2 text-slate-300 transition-colors hover:bg-slate-700">Cancel Order</button>}
        {order && <button onClick={() => navigate(`/admin/audit?module=Manufacturing&record_id=${order.id}`)} className="rounded-xl bg-slate-800 border border-slate-700 px-5 py-2.5 font-medium text-white transition-colors hover:bg-slate-700">Logs</button>}
      </div>
    </div>
  );
}