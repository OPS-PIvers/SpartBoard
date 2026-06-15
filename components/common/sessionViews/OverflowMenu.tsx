import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Z_INDEX } from '@/config/zIndex';

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
 * the results-view headers — secondary actions live here. The dropdown is
 * portalled to <body> (position:fixed, measured from the trigger) so it isn't
 * clipped by the widget's overflow-hidden container (DraggableWindow), the same
 * pattern the library's own overflow menus use. Implements the core ARIA
 * menu-button keyboard pattern: focus moves to the first item on open, Arrow
 * Up/Down navigates, Escape closes + returns focus to the trigger, and Tab
 * closes so focus continues in document order.
 */
export const OverflowMenu: React.FC<OverflowMenuProps> = ({
  items,
  ariaLabel = 'More actions',
}) => {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null
  );
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside click — ignore the portalled menu so clicks inside it
  // don't close it. Memoized so useClickOutside doesn't re-subscribe each render.
  const ignoreRefs = useMemo(() => [menuRef], []);
  useClickOutside(wrapperRef, () => setOpen(false), ignoreRefs);

  // Measure the trigger when the menu opens so the portal renders flush under it.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [open]);

  // Move focus to the first enabled item once the menu is positioned + rendered.
  useEffect(() => {
    if (!open || !menuPos) return;
    const menu = menuRef.current;
    // Prefer the first enabled item, but fall back to the first item so focus
    // still enters the menu when every item is (transiently) disabled.
    const target =
      menu?.querySelector<HTMLButtonElement>(
        '[role="menuitem"]:not([aria-disabled="true"])'
      ) ?? menu?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    target?.focus();
  }, [open, menuPos]);

  // Close on scroll/resize — the fixed position is captured at open time.
  useEffect(() => {
    if (!open) return undefined;
    const close = (): void => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key === 'Tab') {
      // The menu is portalled to <body>, so a native Tab from a menu item would
      // jump to the end of the document, not the trigger's neighbour. Close and
      // return focus to the trigger; the user's next Tab then advances naturally.
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const nodes = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]'
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
    <div className="relative" ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white/70 hover:text-brand-blue-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-1"
        style={{ width: 'min(36px, 10cqmin)', height: 'min(36px, 10cqmin)' }}
      >
        <MoreHorizontal
          style={{ width: 'min(18px, 5cqmin)', height: 'min(18px, 5cqmin)' }}
        />
      </button>
      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            onKeyDown={onMenuKeyDown}
            style={{
              position: 'fixed',
              top: menuPos.top,
              right: menuPos.right,
              zIndex: Z_INDEX.dropdown,
            }}
            className="min-w-[176px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg"
          >
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id ?? item.label}
                  type="button"
                  role="menuitem"
                  aria-disabled={!!item.disabled || !!item.loading || undefined}
                  onClick={() => {
                    // aria-disabled (not the native attribute) keeps the item
                    // focusable + announced; guard activation here instead.
                    if (item.disabled || item.loading) return;
                    setOpen(false);
                    triggerRef.current?.focus();
                    item.onClick();
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-medium transition-colors focus:outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${
                    item.destructive
                      ? 'text-brand-red-dark hover:bg-brand-red-lighter/30 focus:bg-brand-red-lighter/30'
                      : 'text-slate-700 hover:bg-slate-100 focus:bg-slate-100'
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
          </div>,
          document.body
        )}
    </div>
  );
};
