import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface OverflowMenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface OverflowMenuProps {
  items: OverflowMenuItem[];
  ariaLabel?: string;
}

/**
 * Kebab overflow menu matching the library dropdown surface. Used to declutter
 * the results-view headers — secondary actions live here.
 */
export const OverflowMenu: React.FC<OverflowMenuProps> = ({
  items,
  ariaLabel = 'More actions',
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // External-system sync (document click) — a valid useEffect use.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white/70 hover:text-brand-blue-primary"
        style={{ width: 'min(36px, 10cqmin)', height: 'min(36px, 10cqmin)' }}
      >
        <MoreHorizontal
          style={{ width: 'min(18px, 5cqmin)', height: 'min(18px, 5cqmin)' }}
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-50 min-w-[176px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  item.destructive
                    ? 'text-brand-red-dark hover:bg-brand-red-lighter/30'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {Icon && <Icon size={16} className="shrink-0" />}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
