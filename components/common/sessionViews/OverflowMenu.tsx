import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface OverflowMenuItem {
  label: string;
  /** Stable React key; falls back to `label` when omitted. Set this when two
   *  items could share a label (e.g. re-export variants). */
  id?: string;
  icon?: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Show a spinner in place of the icon while an async action is in flight. */
  loading?: boolean;
}

interface OverflowMenuProps {
  items: OverflowMenuItem[];
  ariaLabel?: string;
}

/**
 * Kebab overflow menu matching the library dropdown surface. Used to declutter
 * the results-view headers — secondary actions live here. Implements the core
 * ARIA menu-button keyboard pattern: focus moves to the first item on open,
 * Arrow Up/Down navigates items, and Escape closes + returns focus to the
 * trigger so a keyboard user keeps their place.
 */
export const OverflowMenu: React.FC<OverflowMenuProps> = ({
  items,
  ariaLabel = 'More actions',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape. Escape returns focus to the trigger.
  // External-system sync (document listeners) — a valid useEffect use.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent): void => {
      if (
        containerRef.current &&
        e.target &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Move focus into the menu (first enabled item) when it opens.
  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')
      ?.focus();
  }, [open]);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const nodes = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not([disabled])'
      ) ?? []
    );
    if (nodes.length === 0) return;
    const idx = nodes.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === 'ArrowDown'
        ? nodes[(idx + 1) % nodes.length]
        : nodes[(idx - 1 + nodes.length) % nodes.length];
    next?.focus();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
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
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full mt-1 z-50 min-w-[176px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id ?? item.label}
                type="button"
                role="menuitem"
                disabled={!!item.disabled || !!item.loading}
                onClick={() => {
                  setOpen(false);
                  // Return focus to the trigger so keyboard users keep their
                  // place on the header bar after a secondary action.
                  triggerRef.current?.focus();
                  item.onClick();
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  item.destructive
                    ? 'text-brand-red-dark hover:bg-brand-red-lighter/30'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {item.loading ? (
                  <Loader2 size={16} className="shrink-0 animate-spin" />
                ) : (
                  Icon && <Icon size={16} className="shrink-0" />
                )}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
