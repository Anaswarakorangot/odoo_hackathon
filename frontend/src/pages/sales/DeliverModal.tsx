import { useState } from 'react';
import { salesOrdersApi } from '../../api/sales';
import type { SalesOrder, SalesOrderLineDeliver } from '../../types/sales';

interface DeliverModalProps {
  order: SalesOrder;
  onClose: () => void;
  onComplete: () => void;
}

interface DeliveryLine {
  line_id: string;
  product_name: string;
  ordered_qty: number;
  current_delivered_qty: number;
  new_delivered_qty: number;
}

export default function DeliverModal({ order, onClose, onComplete }: DeliverModalProps) {
  const [lines, setLines] = useState<DeliveryLine[]>(
    order.lines
      .filter(line => line.delivered_qty < line.ordered_qty)
      .map(line => ({
        line_id: line.id,
        product_name: line.product_name,
        ordered_qty: line.ordered_qty,
        current_delivered_qty: line.delivered_qty,
        new_delivered_qty: 0,
      }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const updateLineQty = (lineId: string, qty: number) => {
    setLines(prev =>
      prev.map(line =>
        line.line_id === lineId
          ? { ...line, new_delivered_qty: Math.max(0, Math.min(qty, line.ordered_qty - line.current_delivered_qty)) }
          : line
      )
    );
  };

  const handleSubmit = async () => {
    const deliveryLines: SalesOrderLineDeliver[] = lines
      .filter(line => line.new_delivered_qty > 0)
      .map(line => ({
        line_id: line.line_id,
        delivered_qty: line.new_delivered_qty,
      }));

    if (deliveryLines.length === 0) {
      setError('Please enter at least one delivery quantity');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await salesOrdersApi.deliver(order.id, { lines: deliveryLines });
      onComplete();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to record delivery');
    } finally {
      setSubmitting(false);
    }
  };

  const remainingQty = (line: DeliveryLine) => line.ordered_qty - line.current_delivered_qty;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800">
          <h2 className="text-xl font-semibold text-white">Record Delivery</h2>
          <p className="text-sm text-slate-400 mt-1">
            {order.reference} - {order.customer.name}
          </p>
        </div>

        {/* Body */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          {lines.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              All lines are fully delivered
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-12 gap-4 text-sm font-medium text-slate-400 pb-2 border-b border-slate-800">
                <div className="col-span-4">Product</div>
                <div className="col-span-2 text-center">Ordered</div>
                <div className="col-span-2 text-center">Delivered</div>
                <div className="col-span-2 text-center">Remaining</div>
                <div className="col-span-2 text-center">Deliver Now</div>
              </div>

              {lines.map(line => (
                <div key={line.line_id} className="grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-4 text-white font-medium truncate">
                    {line.product_name}
                  </div>
                  <div className="col-span-2 text-center text-slate-300">
                    {line.ordered_qty}
                  </div>
                  <div className="col-span-2 text-center text-slate-300">
                    {line.current_delivered_qty}
                  </div>
                  <div className="col-span-2 text-center text-amber-400">
                    {remainingQty(line)}
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min={0}
                      max={remainingQty(line)}
                      value={line.new_delivered_qty}
                      onChange={(e) => updateLineQty(line.line_id, parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-center focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            Cancel
          </button>
          {lines.length > 0 && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium hover:from-cyan-400 hover:to-blue-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Delivering...' : 'Deliver'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
