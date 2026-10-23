import type React from 'react';
import { Check } from 'lucide-react';
import { tourAttr, type TourAnchorId } from '@/config/tourAnchors';

interface ModeOptionProps {
  selected: boolean;
  title: string;
  body: string;
  Icon: React.ComponentType<{ className?: string }>;
  onPick: () => void;
  tourId?: TourAnchorId;
}

export const ModeOption: React.FC<ModeOptionProps> = ({
  selected,
  title,
  body,
  Icon,
  onPick,
  tourId,
}) => {
  return (
    <button
      type="button"
      onClick={onPick}
      {...(tourId ? tourAttr(tourId) : {})}
      className={`w-full text-left rounded-xl border bg-white px-4 py-4 transition-all focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 cursor-pointer ${
        selected
          ? 'border-brand-blue-primary shadow-md ring-1 ring-brand-blue-lighter'
          : 'border-slate-200 hover:border-brand-blue-primary hover:shadow-sm'
      }`}
      aria-pressed={selected}
    >
      <div className="flex items-start gap-3">
        <div
          className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
            selected
              ? 'bg-brand-blue-primary text-white'
              : 'bg-brand-blue-lighter/40 text-brand-blue-primary'
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">{body}</p>
        </div>
        {selected && (
          <div className="shrink-0 self-center text-brand-blue-primary">
            <Check className="w-5 h-5" />
          </div>
        )}
      </div>
    </button>
  );
};
