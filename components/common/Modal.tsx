import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  variant?: 'default' | 'bare';
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  customHeader?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  zIndex?: string; // e.g. "z-modal", "z-modal-deep"
  maxWidth?: string; // e.g. "max-w-md", "max-w-2xl"
  className?: string; // For additional styling on the content container
  contentClassName?: string; // For additional styling on the body/content wrapper
  footerClassName?: string; // For additional styling on the footer wrapper
  captureEscape?: boolean; // Whether to use capture phase for Escape key
  ariaLabel?: string;
  ariaLabelledby?: string;
}

// Track number of open modals to handle nested locking correctly
let openModalCount = 0;

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  customHeader,
  children,
  footer,
  zIndex = 'z-modal',
  maxWidth = 'max-w-md',
  className = '',
  contentClassName = 'px-6',
  footerClassName = 'p-6 pt-4 mt-auto shrink-0 border-t border-slate-100',
  variant = 'default',
  captureEscape = false,
  ariaLabel,
  ariaLabelledby,
}) => {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (captureEscape) e.stopImmediatePropagation();
        onClose();
      }
    };

    if (openModalCount === 0) {
      document.body.style.overflow = 'hidden';
    }
    openModalCount++;
    window.addEventListener(
      'keydown',
      handleEscape,
      captureEscape ? { capture: true } : undefined
    );

    return () => {
      openModalCount--;
      if (openModalCount === 0) {
        document.body.style.overflow = 'unset';
      }
      window.removeEventListener(
        'keydown',
        handleEscape,
        captureEscape ? { capture: true } : undefined
      );
    };
  }, [isOpen, onClose, captureEscape]);

  if (!isOpen) return null;

  // Ensure we are in a browser environment
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${zIndex} flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? (!ariaLabelledby ? title : undefined)}
      aria-labelledby={ariaLabelledby}
    >
      <div
        className={`w-full ${maxWidth} flex flex-col max-h-[90vh] ${variant === 'default' ? 'bg-white rounded-2xl shadow-2xl' : ''} ${className} animate-in zoom-in-95 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {variant === 'default' &&
          (customHeader ?? (
            <div className="flex items-center justify-between p-6 pb-0 mb-4 shrink-0">
              {title && (
                <h3 className="font-black text-lg text-slate-800">{title}</h3>
              )}
              <button
                onClick={onClose}
                className="p-1 hover:bg-slate-100 rounded-full text-slate-400 transition-colors ml-auto"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
          ))}

        <div
          className={`flex-1 overflow-y-auto custom-scrollbar ${variant === 'default' ? contentClassName : ''}`}
        >
          {children}
        </div>

        {footer && <div className={footerClassName}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
};
