import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Z_INDEX } from '@/config/zIndex';
import { usePopoverPosition } from '../editorShared/usePopoverPosition';

export interface StudioMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Shortcut hint shown on the right, e.g. "Ctrl+D". */
  hint?: string;
  disabled?: boolean;
  onSelect: () => void;
}

const MENU_WIDTH = 220;

/** Small action menu for Studio rows; portalled above the full-screen Studio. */
export const StudioMenu: React.FC<{
  label: string;
  items: StudioMenuItem[];
  triggerClassName: string;
  testId?: string;
}> = ({ label, items, triggerClassName, testId }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(wrapperRef, () => setOpen(false), [menuRef]);
  const pos = usePopoverPosition(open, triggerRef, MENU_WIDTH);

  // Focus the first enabled item once the menu is placed.
  useEffect(() => {
    if (!open || !pos) return;
    menuRef.current
      ?.querySelector<HTMLButtonElement>(
        '[role="menuitem"]:not([aria-disabled="true"])'
      )
      ?.focus();
  }, [open, pos]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const nodes = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]'
      ) ?? []
    );
    const idx = nodes.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    nodes[(idx + step + nodes.length) % nodes.length]?.focus();
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testId}
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName}
      >
        <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            onKeyDown={onKeyDown}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: MENU_WIDTH,
              zIndex: Z_INDEX.popover,
            }}
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                aria-disabled={item.disabled ? true : undefined}
                onClick={() => {
                  if (item.disabled) return;
                  close();
                  item.onSelect();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-medium text-slate-700 transition-colors hover:bg-slate-100 focus:bg-slate-100 focus:outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint && (
                  <kbd className="shrink-0 font-sans text-xxs text-slate-400">
                    {item.hint}
                  </kbd>
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
};
