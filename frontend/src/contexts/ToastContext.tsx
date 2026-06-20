import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { auditLogsApi } from '../api/audit';
import { useAuth } from './AuthContext';

export interface Toast {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { user } = useAuth();
  
  // Track the last seen timestamp for polling and seen IDs to prevent duplicates
  const lastCheckRef = useRef<string>(new Date().toISOString());
  const seenLogsRef = useRef<Set<string>>(new Set());
  
  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Poll for new audit logs every 5 seconds to simulate WebSockets
  useEffect(() => {
    if (!user) return; // Don't poll if not logged in
    
    let isMounted = true;
    
    const pollLogs = async () => {
      try {
        const response = await auditLogsApi.list({
          since: lastCheckRef.current,
          page_size: 10
        });
        
        if (!isMounted) return;
        
        if (response.items && response.items.length > 0) {
          // Update the last check time to the most recent log
          const newestTime = new Date(response.items[0].occurred_at).toISOString();
          lastCheckRef.current = newestTime;
          
          // Show toasts for relevant events created by OTHER users or auto-systems
          // Filter out simple updates by the current user to avoid spam
          const relevantLogs = response.items.filter(log => {
            if (seenLogsRef.current.has(log.id)) return false;
            return log.action === 'created' || log.action === 'status_changed';
          });
          
          for (const log of relevantLogs.reverse()) {
            seenLogsRef.current.add(log.id);
            // Don't show toast if the user did it themselves (unless it's an auto-creation)
            if (log.user_id === user.id && !log.record_type.includes('Order')) continue;
            
            let title = 'System Update';
            let message = `${log.module} ${log.record_type} was ${log.action}`;
            
            if (log.module === 'Sales' && log.action === 'created') {
              title = 'New Sales Order';
              message = 'A new Sales Order has been drafted.';
            } else if (log.module === 'Manufacturing' && log.action === 'created') {
              title = 'New Manufacturing Order';
              message = 'A Manufacturing Order was auto-generated to handle a shortage.';
            } else if (log.module === 'Purchase' && log.action === 'created') {
              title = 'New Purchase Order';
              message = 'A Purchase Order was auto-generated for missing raw materials.';
            } else if (log.action === 'status_changed') {
              title = `${log.record_type} Updated`;
              message = `Status changed to ${log.new_value}`;
            }
            
            addToast({
              title,
              message,
              type: 'info'
            });
            
            // Dispatch a custom event so other components can refresh their lists
            window.dispatchEvent(new CustomEvent('systemDataChanged'));
          }
        }
      } catch (err) {
        // Ignore polling errors
      }
    };
    
    const interval = setInterval(pollLogs, 3000); // 3 seconds
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user, addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div 
            key={toast.id} 
            className="pointer-events-auto w-80 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-4 animate-slide-up relative overflow-hidden"
          >
            {/* Color Accent Line */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${
              toast.type === 'info' ? 'bg-blue-500' :
              toast.type === 'success' ? 'bg-emerald-500' :
              toast.type === 'warning' ? 'bg-amber-500' : 'bg-rose-500'
            }`} />
            
            <div className="pl-2">
              <h4 className="text-sm font-semibold text-white">{toast.title}</h4>
              <p className="text-xs text-slate-300 mt-1">{toast.message}</p>
            </div>
            
            <button 
              onClick={() => removeToast(toast.id)}
              className="absolute top-2 right-2 text-slate-400 hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      
      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out forwards;
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
