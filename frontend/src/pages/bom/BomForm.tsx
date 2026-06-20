import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { bomsApi } from '../../api/manufacturing';
import { productsApi } from '../../api/purchase';
import type { Bom, BomLineCreate, BomOperationCreate } from '../../types/manufacturing';
import type { ProductBrief } from '../../types/purchase';

interface LineRow {
  id?: string;
  component_product_id: string;
  qty_per_unit: number;
}

interface OperationRow {
  id?: string;
  sequence: number;
  operation_name: string;
  work_center: string;
  expected_duration_min: number;
}

export default function BomForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [bom, setBom] = useState<Bom | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [finishedProductId, setFinishedProductId] = useState('');
  const [lines, setLines] = useState<LineRow[]>([]);
  const [operations, setOperations] = useState<OperationRow[]>([]);

  const [products, setProducts] = useState<ProductBrief[]>([]);

  useEffect(() => {
    productsApi.list().then(setProducts).catch(console.error);
    if (!isNew && id) loadBom(id);
  }, [id]);

  const loadBom = async (bomId: string) => {
    try {
      setLoading(true);
      const data = await bomsApi.get(bomId);
      setBom(data);
      setFinishedProductId(data.finished_product.id);
      setLines(
        data.bom_lines.map((l) => ({
          id: l.id,
          component_product_id: l.component_product_id,
          qty_per_unit: Number(l.qty_per_unit),
        }))
      );
      setOperations(
        data.bom_operations.map((o) => ({
          id: o.id,
          sequence: o.sequence,
          operation_name: o.operation_name,
          work_center: o.work_center,
          expected_duration_min: o.expected_duration_min,
        }))
      );
    } catch (err) {
      setError('Failed to load BoM');
    } finally {
      setLoading(false);
    }
  };

  const addLine = () => {
    if (products.length === 0) return;
    setLines([...lines, { component_product_id: products[0].id, qty_per_unit: 1 }]);
  };

  const updateLine = (idx: number, field: keyof LineRow, value: any) => {
    const next = [...lines];
    (next[idx] as any)[field] = field === 'qty_per_unit' ? Number(value) || 0 : value;
    setLines(next);
  };

  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));

  const addOperation = () => {
    const nextSeq = operations.length > 0 ? Math.max(...operations.map((o) => o.sequence)) + 1 : 1;
    setOperations([
      ...operations,
      { sequence: nextSeq, operation_name: '', work_center: '', expected_duration_min: 0 },
    ]);
  };

  const updateOperation = (idx: number, field: keyof OperationRow, value: any) => {
    const next = [...operations];
    if (field === 'sequence' || field === 'expected_duration_min') {
      (next[idx] as any)[field] = Number(value) || 0;
    } else {
      (next[idx] as any)[field] = value;
    }
    setOperations(next);
  };

  const removeOperation = (idx: number) =>
    setOperations(operations.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!finishedProductId) {
      setError('Please select a finished product');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const bom_lines: BomLineCreate[] = lines.map((l) => ({
        component_product_id: l.component_product_id,
        qty_per_unit: l.qty_per_unit,
      }));
      const bom_operations: BomOperationCreate[] = operations.map((o) => ({
        sequence: o.sequence,
        operation_name: o.operation_name,
        work_center: o.work_center,
        expected_duration_min: o.expected_duration_min,
      }));

      if (isNew) {
        const created = await bomsApi.create({
          finished_product_id: finishedProductId,
          bom_lines,
          bom_operations,
        });
        navigate(`/bom/${created.id}`);
      } else if (bom) {
        await bomsApi.update(bom.id, {
          finished_product_id: finishedProductId,
          bom_lines,
          bom_operations,
        });
        loadBom(bom.id);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save BoM');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!bom) return;
    if (!confirm(`Delete ${bom.reference}?`)) return;
    setSaving(true);
    try {
      await bomsApi.delete(bom.id);
      navigate('/bom');
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/bom')}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {isNew ? 'New Bill of Materials' : bom?.reference}
            </h1>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium hover:from-cyan-400 hover:to-blue-400 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {!isNew && (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="px-4 py-2 bg-red-500 text-white rounded-xl font-medium hover:bg-red-400 disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
          {error}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
        {/* Finished product */}
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2">Finished Product *</label>
          <select
            value={finishedProductId}
            onChange={(e) => setFinishedProductId(e.target.value)}
            className="w-full md:w-1/2 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          >
            <option value="">Select a product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Component Lines */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <label className="text-sm font-medium text-slate-400">Components</label>
            <button
              onClick={addLine}
              className="px-3 py-1.5 text-sm bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700"
            >
              + Add Component
            </button>
          </div>
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Component Product</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-slate-400 w-40">Qty per Unit</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                      No components yet
                    </td>
                  </tr>
                ) : (
                  lines.map((line, idx) => (
                    <tr key={idx} className="border-t border-slate-800/50">
                      <td className="px-4 py-3">
                        <select
                          value={line.component_product_id}
                          onChange={(e) => updateLine(idx, 'component_product_id', e.target.value)}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={line.qty_per_unit}
                          onChange={(e) => updateLine(idx, 'qty_per_unit', e.target.value)}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-right focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => removeLine(idx)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Operations */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <label className="text-sm font-medium text-slate-400">Operations</label>
            <button
              onClick={addOperation}
              className="px-3 py-1.5 text-sm bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700"
            >
              + Add Operation
            </button>
          </div>
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-400 w-20">Seq</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Operation Name</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Work Center</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-slate-400 w-40">Expected (min)</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {operations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No operations yet
                    </td>
                  </tr>
                ) : (
                  operations.map((op, idx) => (
                    <tr key={idx} className="border-t border-slate-800/50">
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={op.sequence}
                          onChange={(e) => updateOperation(idx, 'sequence', e.target.value)}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={op.operation_name}
                          onChange={(e) => updateOperation(idx, 'operation_name', e.target.value)}
                          placeholder="e.g. Cut steel"
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={op.work_center}
                          onChange={(e) => updateOperation(idx, 'work_center', e.target.value)}
                          placeholder="e.g. Assembly Line 1"
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={op.expected_duration_min}
                          onChange={(e) => updateOperation(idx, 'expected_duration_min', e.target.value)}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-right focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => removeOperation(idx)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
