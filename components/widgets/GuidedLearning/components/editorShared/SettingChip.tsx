import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Z_INDEX } from '@/config/zIndex';
import { usePopoverPosition } from './usePopoverPosition';

// ─── SettingChip (compact "Label: value ▾" with popover) ─────────────────────

interface SettingChipOption<T extends string> {
  value: T;
  label: string;
  desc: string;
}

interface SettingChipProps<T extends string> {
  label: string;
  /**
   * Leading icon that identifies what the chip controls. The verbose
   * uppercase label is intentionally replaced by an icon so the chip row
   * fits in narrower modal widths; `label` is preserved as the tooltip.
   */
  icon: LucideIcon;
  value: T;
  options: SettingChipOption<T>[];
  onChange: (next: T) => void;
}

/**
 * Compact "Label: value ▾" chip that opens a small popover of options.
 * Replaces a labeled segmented row when the row would consume more
 * vertical space than the choice deserves (e.g. set-level display
 * settings the teacher tweaks once and forgets).
 */
const SETTING_CHIP_POPOVER_WIDTH = 220;

export function SettingChip<T extends string>({
  label,
  icon: Icon,
  value,
  options,
  onChange,
}: SettingChipProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Click-outside listens on both the chip container AND the portal'd
  // popover so clicks inside the popover don't dismiss it.
  useClickOutside(containerRef, () => setOpen(false), [popoverRef]);

  const current = options.find((o) => o.value === value);
  const currentLabel = current?.label ?? value;
  const pos = usePopoverPosition(open, triggerRef, SETTING_CHIP_POPOVER_WIDTH);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`${label}${current?.desc ? ` — ${current.desc}` : ''}`}
        aria-label={`${label}: ${currentLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap transition-colors ${
          open
            ? 'border-brand-blue-primary bg-brand-blue-primary/10 text-brand-blue-primary'
            : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
        }`}
      >
        <Icon className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
        <span>{currentLabel}</span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>
      {open &&
        pos &&
        typeof document !== 'undefined' &&
        // Portal'd to document.body so the popover escapes the modal
        // body's `overflow-hidden` and the chip row's `overflow-x-auto`.
        // Without this the menu was being clipped by ancestor scroll
        // containers and inaccessible.
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
              width: SETTING_CHIP_POPOVER_WIDTH,
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
            {options.map((opt) => {
              const isCurrent = opt.value === value;
              return (
                <button
                  key={opt.value}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors ${
                    isCurrent
                      ? 'bg-brand-blue-lighter/40 text-brand-blue-dark'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="font-bold text-xs">{opt.label}</span>
                  <span className="text-xxs text-slate-500 leading-snug">
                    {opt.desc}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
