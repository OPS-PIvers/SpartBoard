import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  ChevronDown,
  Circle,
  Film,
  MonitorUp,
  type LucideIcon,
} from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Z_INDEX } from '@/config/zIndex';
import type { CaptureMode } from '../ScreenCaptureModal';
import { usePopoverPosition } from './usePopoverPosition';

// ─── Capture menu (Snap / Record / From video) ───────────────────────────────

const CAPTURE_OPTIONS: {
  value: CaptureMode;
  label: string;
  desc: string;
  icon: LucideIcon;
}[] = [
  {
    value: 'snap',
    label: 'Snap screen frames',
    desc: 'A still for each step',
    icon: Camera,
  },
  {
    value: 'record',
    label: 'Record your screen',
    desc: 'One video slide',
    icon: Circle,
  },
  {
    value: 'video-file',
    label: 'Slides from a video',
    desc: 'Frames or the whole clip',
    icon: Film,
  },
];

const CAPTURE_MENU_WIDTH = 260;

export const CaptureMenuButton: React.FC<{
  onPick: (mode: CaptureMode) => void;
}> = ({ onPick }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, () => setOpen(false), [popoverRef]);
  const pos = usePopoverPosition(open, triggerRef, CAPTURE_MENU_WIDTH);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-1.5 px-3 py-1.5 font-bold rounded-lg transition-colors text-sm border ${
          open
            ? 'bg-brand-blue-primary/10 border-brand-blue-primary text-brand-blue-primary'
            : 'bg-white border-slate-300 hover:border-slate-400 text-slate-700'
        }`}
      >
        <MonitorUp className="w-4 h-4" />
        Capture screen
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>
      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            role="menu"
            data-widget-portal=""
            data-click-outside-ignore="true"
            className="overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: CAPTURE_MENU_WIDTH,
              zIndex: Z_INDEX.modalContent,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.nativeEvent.stopImmediatePropagation();
                // Also stop React's synthetic bubble: this popover renders in
                // the widget settings panel wrapped by DraggableWindow's
                // onKeyDown, whose flipped-close branch would otherwise fire and
                // close the whole settings panel along with this popover.
                e.stopPropagation();
                setOpen(false);
              }
            }}
          >
            {CAPTURE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPick(opt.value);
                }}
                className="flex w-full items-start gap-2.5 px-3 py-2 text-left text-slate-700 transition-colors hover:bg-slate-100"
              >
                <opt.icon className="w-4 h-4 mt-0.5 shrink-0 text-brand-blue-primary" />
                <span>
                  <span className="block font-bold text-xs">{opt.label}</span>
                  <span className="block text-xxs text-slate-500 leading-snug">
                    {opt.desc}
                  </span>
                </span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
};
