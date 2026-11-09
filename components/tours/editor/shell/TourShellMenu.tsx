import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, MoreHorizontal } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { headerIconBtn } from '@/components/common/lightChrome';
import type { TourShellMenuItem } from './types';

/** The header's ⋯ menu; drops down inside the panel so it sits above the stage. */
export const TourShellMenu: React.FC<{
  items: readonly TourShellMenuItem[];
  footer?: React.ReactNode;
}> = ({ items, footer }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useClickOutside(wrapper, () => setOpen(false));
  if (items.length === 0 && !footer) return null;

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const nodes = Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ??
        []
    );
    const at = nodes.indexOf(document.activeElement as HTMLButtonElement);
    const by = e.key === 'ArrowDown' ? 1 : -1;
    nodes[(at + by + nodes.length) % nodes.length]?.focus();
  };

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label={t('tours.shell.menu')}
        title={t('tours.shell.menu')}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="tour-shell-menu"
        onClick={() => setOpen((v) => !v)}
        className={`${headerIconBtn} bg-white/10`}
        {...tourAttr('tour-editor.menu')}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label={t('tours.shell.menu')}
          onKeyDown={onKeyDown}
          className="absolute right-0 top-full z-10 mt-1.5 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm text-slate-700 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role={
                item.pressed === undefined ? 'menuitem' : 'menuitemcheckbox'
              }
              aria-checked={item.pressed}
              aria-disabled={item.disabled ? true : undefined}
              onClick={() => {
                if (item.disabled) return;
                close();
                item.onSelect();
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-medium hover:bg-slate-100 focus:bg-slate-100 focus:outline-hidden aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${
                item.danger ? 'text-brand-red-primary' : ''
              }`}
              {...tourFieldAttr(
                'tour-editor.menu-item',
                'guided-learning',
                item.id
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.pressed && (
                <Check
                  className="h-4 w-4 shrink-0 text-brand-blue-primary"
                  aria-hidden="true"
                />
              )}
            </button>
          ))}
          {footer && (
            <div className="mt-1 border-t border-slate-100 px-3 pb-1 pt-2">
              {footer}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
