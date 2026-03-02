import React from 'react';
import {
  CheckCircle,
  AlertCircle,
  Info,
  AlertTriangle,
  Loader2,
  X,
} from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'loading';

interface ToastProps {
  message: string;
  type?: ToastType;
  onClose?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  onClose,
  action,
  className = '',
}) => {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 shrink-0" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 shrink-0" />;
      case 'loading':
        return <Loader2 className="w-5 h-5 shrink-0 animate-spin" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 shrink-0" />;
    }
  };

  const getStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-500 text-white';
      case 'error':
        return 'bg-brand-red-primary text-white';
      case 'warning':
        return 'bg-yellow-500 text-white';
      case 'loading':
        return 'bg-brand-blue-primary text-white';
      case 'info':
      default:
        return 'bg-brand-blue-primary text-white';
    }
  };

  return (
    <div
      className={`fixed bottom-4 right-4 z-toast px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-4 fade-in duration-300 ${getStyles()} ${className}`}
      role={type === 'error' || type === 'warning' ? 'alert' : 'status'}
    >
      {getIcon()}
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{message}</span>
        {action && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
            }}
            className="text-xxs font-black uppercase tracking-widest px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded transition-all text-left w-fit"
          >
            {action.label}
          </button>
        )}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-1 p-1 hover:bg-white/20 rounded-full transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
