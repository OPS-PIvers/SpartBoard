import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
} from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useDashboard();
  // The wrapper is a positioning container only — live-region semantics live on
  // each toast (role="status"/aria-live="polite" for normal updates, role="alert"
  // for errors). Keeping the live region on the individual toast avoids nesting
  // an assertive region inside a polite one, which some screen readers announce
  // unpredictably or drop entirely.
  return (
    <div
      // Toasts sit outside every widget's DOM subtree, so clicking one (e.g. an
      // "Undo" action) would otherwise register as a click outside an open
      // SettingsPanel and close it. Exclude the whole stack from that check.
      data-settings-exclude
      data-toast-stack=""
      className="fixed z-toast space-y-3 pointer-events-none"
      style={{
        top: 'calc(1.5rem + env(safe-area-inset-top, 0px))',
        right: 'calc(1.5rem + env(safe-area-inset-right, 0px))',
      }}
    >
      {toasts.map((toast) => {
        const getStyles = () => {
          switch (toast.type) {
            case 'success':
              return 'bg-green-50/90 border-green-200 text-green-800';
            case 'error':
              return 'bg-red-50/90 border-red-200 text-red-800';
            case 'warning':
              return 'bg-yellow-50/90 border-yellow-200 text-yellow-800';
            case 'loading':
              return 'bg-blue-50/90 border-blue-200 text-blue-800';
            case 'info':
            default:
              return 'bg-white/90 border-slate-200 text-slate-800';
          }
        };

        const getIcon = () => {
          switch (toast.type) {
            case 'success':
              return <CheckCircle2 className="w-5 h-5 text-green-600" />;
            case 'error':
              return <AlertCircle className="w-5 h-5 text-red-600" />;
            case 'warning':
              return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
            case 'loading':
              return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
            case 'info':
            default:
              return <Info className="w-5 h-5 text-blue-600" />;
          }
        };

        const isError = toast.type === 'error';
        return (
          <div
            key={toast.id}
            // Errors announce assertively via role="alert"; normal updates use
            // role="status" (implicit aria-live="polite") so they don't
            // interrupt screen-reader output.
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? undefined : 'polite'}
            onClick={() => removeToast(toast.id)}
            className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl backdrop-blur-xl border pointer-events-auto cursor-pointer animate-in slide-in-from-right duration-300 ${getStyles()}`}
          >
            {getIcon()}
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-sm">{toast.message}</span>
              {toast.action && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.action?.onClick();
                      removeToast(toast.id);
                    }}
                    className="w-fit px-2 py-1 bg-black/5 hover:bg-black/10 rounded-lg text-xxs font-black uppercase tracking-widest transition-colors"
                  >
                    {toast.action.label}
                  </button>
                  {toast.action.secondary && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toast.action?.secondary?.onClick();
                        removeToast(toast.id);
                      }}
                      className="w-fit px-2 py-1 hover:bg-black/5 rounded-lg text-xxs font-bold uppercase tracking-widest transition-colors"
                    >
                      {toast.action.secondary.label}
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Explicit dismiss control so SR/keyboard users can close a toast
                before it auto-dismisses (the whole card is also clickable). */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeToast(toast.id);
              }}
              aria-label="Dismiss"
              className="ml-1 p-1 rounded-full hover:bg-black/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
