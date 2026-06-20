import { useState } from 'react';
import apiClient from '../../api/client';

interface RecallResult {
  mo_id: string;
  mo_reference: string;
  vin_number: string | null;
  component_name: string;
  batch_number: string;
  consumed_qty: number;
  source_sales_order_id: string | null;
  source_sales_order_ref: string | null;
  customer_name: string | null;
}

interface RecallLookupResponse {
  batch_number: string;
  affected_count: number;
  results: RecallResult[];
}

export default function RecallLookup() {
  const [batchNumber, setBatchNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<RecallLookupResponse | null>(null);

  const handleSearch = async () => {
    if (!batchNumber.trim()) {
      setError('Please enter a batch number');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const { data } = await apiClient.get<RecallLookupResponse>('/recall/lookup', {
        params: { batch_number: batchNumber.trim() },
      });
      setResponse(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to look up batch');
      setResponse(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Recall Lookup</h1>
        <p className="text-slate-400 text-sm mt-1">
          Find all vehicles and customers affected by a defective component batch
        </p>
      </div>

      {/* Search Box */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Batch Number
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            value={batchNumber}
            onChange={(e) => setBatchNumber(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="e.g., BF-2024-0042"
            className="flex-1 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 text-lg"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium hover:from-cyan-400 hover:to-blue-400 transition-all disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Enter the batch number from the supplier's defect notification
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      {response && (
        <div className="space-y-4">
          {/* Summary */}
          <div className={`p-4 rounded-xl border ${
            response.affected_count > 0
              ? 'bg-amber-500/10 border-amber-500/30'
              : 'bg-emerald-500/10 border-emerald-500/30'
          }`}>
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-bold ${
                response.affected_count > 0 ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {response.affected_count}
              </span>
              <span className={response.affected_count > 0 ? 'text-amber-300' : 'text-emerald-300'}>
                {response.affected_count === 1 ? 'affected record' : 'affected records'} found for batch{' '}
                <span className="font-mono font-bold">{response.batch_number}</span>
              </span>
            </div>
          </div>

          {/* Results Table */}
          {response.results.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">MO Reference</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">VIN</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Component</th>
                    <th className="text-right px-6 py-4 text-sm font-medium text-slate-400">Qty Used</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Sales Order</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Customer</th>
                  </tr>
                </thead>
                <tbody>
                  {response.results.map((result, idx) => (
                    <tr key={`${result.mo_id}-${idx}`} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-6 py-4 font-medium text-white">{result.mo_reference}</td>
                      <td className="px-6 py-4 font-mono text-cyan-400">
                        {result.vin_number || <span className="text-slate-500">-</span>}
                      </td>
                      <td className="px-6 py-4 text-slate-300">{result.component_name}</td>
                      <td className="px-6 py-4 text-right text-white">{result.consumed_qty}</td>
                      <td className="px-6 py-4">
                        {result.source_sales_order_ref ? (
                          <span className="text-blue-400">{result.source_sales_order_ref}</span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {result.customer_name ? (
                          <span className="text-amber-400 font-medium">{result.customer_name}</span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* No Results */}
          {response.results.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              No manufacturing orders found using this batch number.
              <br />
              <span className="text-sm text-slate-500">
                This batch may not have been consumed yet, or the batch number may be incorrect.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!response && !loading && !error && (
        <div className="text-center py-16 text-slate-500">
          <div className="text-4xl mb-4">&#x1F50D;</div>
          <p>Enter a batch number above to search for affected vehicles</p>
        </div>
      )}
    </div>
  );
}
