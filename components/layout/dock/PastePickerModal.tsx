import React from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { GlassCard } from '@/components/common/GlassCard';
import { Modal } from '@/components/common/Modal';
import { GlobalStyle } from '@/types';
import { tourAttr, type TourAnchorId } from '@/config/tourAnchors';

interface PastePickerModalProps {
  subtitle?: string;
  closeTourId: TourAnchorId;
  onClose: () => void;
  globalStyle?: GlobalStyle;
  /** Shown between the header and the choices, e.g. a preview of what was pasted. */
  preview?: React.ReactNode;
  children: React.ReactNode;
}

/** The shared "How should this be pasted?" dialog; each paste kind supplies its own choices. */
export const PastePickerModal: React.FC<PastePickerModalProps> = ({
  subtitle,
  closeTourId,
  onClose,
  globalStyle,
  preview,
  children,
}) => (
  <Modal isOpen={true} onClose={onClose} variant="bare" zIndex="z-critical">
    <GlassCard
      globalStyle={globalStyle}
      className="w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
    >
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">
            How should this be pasted?
          </h3>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5 font-bold">
              {subtitle}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          {...tourAttr(closeTourId)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {preview}
      <div className="px-6 pb-6 grid grid-cols-2 gap-3">{children}</div>
    </GlassCard>
  </Modal>
);

const TONES = {
  amber: {
    button:
      'bg-amber-50 hover:bg-amber-100 border-amber-200 hover:border-amber-400',
    icon: 'bg-amber-400 shadow-amber-300/40',
    label: 'text-amber-800',
    hint: 'text-amber-600',
  },
  emerald: {
    button:
      'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 hover:border-emerald-400',
    icon: 'bg-emerald-500 shadow-emerald-400/40',
    label: 'text-emerald-800',
    hint: 'text-emerald-600',
  },
} as const;

interface PasteChoiceProps {
  tourId: TourAnchorId;
  tone: keyof typeof TONES;
  icon: LucideIcon;
  label: string;
  hint?: string;
  onClick: () => void;
}

export const PasteChoice: React.FC<PasteChoiceProps> = ({
  tourId,
  tone,
  icon: Icon,
  label,
  hint,
  onClick,
}) => {
  const t = TONES[tone];
  return (
    <button
      onClick={onClick}
      {...tourAttr(tourId)}
      className={`group flex flex-col items-center gap-3 p-5 border-2 rounded-2xl transition-all active:scale-95 text-left ${t.button}`}
    >
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform ${t.icon}`}
      >
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p
          className={`text-xs font-black uppercase tracking-widest ${t.label}`}
        >
          {label}
        </p>
        {hint && (
          <p className={`text-xxs font-bold mt-0.5 leading-tight ${t.hint}`}>
            {hint}
          </p>
        )}
      </div>
    </button>
  );
};
