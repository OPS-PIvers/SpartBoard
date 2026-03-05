import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlignLeft, CheckSquare, X } from 'lucide-react';
import { GlassCard } from '@/components/common/GlassCard';
import { GlobalStyle } from '@/types';

interface SmartPastePickerModalProps {
  text: string;
  onSelect: (type: 'text' | 'checklist') => void;
  onClose: () => void;
  globalStyle?: GlobalStyle;
}

const PREVIEW_MAX_LENGTH = 120;

export const SmartPastePickerModal: React.FC<SmartPastePickerModalProps> = ({
  text,
  onSelect,
  onClose,
  globalStyle,
}) => {
  const preview =
    text.length > PREVIEW_MAX_LENGTH
      ? text.slice(0, PREVIEW_MAX_LENGTH).trimEnd() + '…'
      : text;

  // Dismiss on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-critical flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <GlassCard
        globalStyle={globalStyle}
        className="w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">
              How should this be pasted?
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 font-bold">
              Pick a widget type for this text
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Text preview — React renders {preview} as a text node, so no XSS risk */}
        <div className="mx-6 mb-5 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
          <p className="text-xs text-slate-500 font-black uppercase tracking-widest mb-1.5">
            Pasted text
          </p>
          <p className="text-sm text-slate-700 font-bold leading-relaxed whitespace-pre-wrap break-words">
            {preview}
          </p>
        </div>

        {/* Choice buttons */}
        <div className="px-6 pb-6 grid grid-cols-2 gap-3">
          <button
            onClick={() => onSelect('text')}
            className="group flex flex-col items-center gap-3 p-5 bg-amber-50 hover:bg-amber-100 border-2 border-amber-200 hover:border-amber-400 rounded-2xl transition-all active:scale-95 text-left"
          >
            <div className="w-11 h-11 rounded-xl bg-amber-400 flex items-center justify-center shadow-md shadow-amber-300/40 group-hover:scale-110 transition-transform">
              <AlignLeft className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-amber-800">
                Text Widget
              </p>
              <p className="text-xxs text-amber-600 font-bold mt-0.5 leading-tight">
                Rich text note on the board
              </p>
            </div>
          </button>

          <button
            onClick={() => onSelect('checklist')}
            className="group flex flex-col items-center gap-3 p-5 bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-200 hover:border-emerald-400 rounded-2xl transition-all active:scale-95 text-left"
          >
            <div className="w-11 h-11 rounded-xl bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-400/40 group-hover:scale-110 transition-transform">
              <CheckSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-emerald-800">
                Checklist
              </p>
              <p className="text-xxs text-emerald-600 font-bold mt-0.5 leading-tight">
                Each line becomes a task item
              </p>
            </div>
          </button>
        </div>
      </GlassCard>
    </div>,
    document.body
  );
};
