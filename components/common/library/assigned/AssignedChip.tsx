import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { isEscapeFromWidgetInput, scrollMovesAnchor } from '@/utils/domHelpers';
import { Z_INDEX } from '@/config/zIndex';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
import { useCloseOnHostResize } from '../../useCloseOnHostResize';

type IconType = React.ComponentType<{
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
  'aria-hidden'?: boolean | 'true';
}>;

export interface AssignedChipOption {
  id: string;
  label: string;
  icon?: IconType;
  /** Colours the option's icon. */
  iconClass?: string;
  selected?: boolean;
  /** Absent on the selected option, which only closes the menu. */
  onSelect?: () => void;
  anchor?: TourAnchorAttrs;
}

interface AssignedChipProps {
  label: string;
  /** Text colour of the chip, from the status tone. */
  textClass: string;
  icon?: IconType | null;
  dot?: boolean;
  options: AssignedChipOption[];
  /** One more action under a hairline, e.g. Publish settings. */
  footer?: AssignedChipOption;
  ariaLabel: string;
  anchor?: TourAnchorAttrs;
  disabled?: boolean;
}

const MENU_WIDTH = 200;
const ROW_H = 32;
const GAP = 4;
const ICON_SIZE = {
  width: 'min(12px, 3.4cqmin)',
  height: 'min(12px, 3.4cqmin)',
};

/** A status word that opens a menu of the other states (Assigned tab). */
export const AssignedChip: React.FC<AssignedChipProps> = ({
  label,
  textClass,
  icon: Icon,
  dot,
  options,
  footer,
  ariaLabel,
  anchor,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  useClickOutside(wrap, close, [menu]);
  useCloseOnHostResize(open, btn, close);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const rows = options.length + (footer ? 1 : 0);
    const h = rows * ROW_H + (footer ? 9 : 0) + 10;
    const below = r.bottom + GAP;
    const top =
      below + h > window.innerHeight - 8 && r.top - GAP - h >= 8
        ? r.top - GAP - h
        : below;
    const left = Math.max(
      8,
      Math.min(r.left, window.innerWidth - MENU_WIDTH - 8)
    );
    setPos({ top, left });
  }, [open, options.length, footer]);

  // Focus the selected row so arrow keys start from it.
  useEffect(() => {
    if (!open || !pos) return;
    const rows =
      menu.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]');
    const on = menu.current?.querySelector<HTMLButtonElement>(
      '[aria-checked="true"]'
    );
    (on ?? rows?.[0])?.focus();
  }, [open, pos]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isEscapeFromWidgetInput(e)) return;
      e.stopPropagation();
      setOpen(false);
      btn.current?.focus();
    };
    const onScroll = (e: Event) => {
      if (scrollMovesAnchor(e, btn.current)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const rows = Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ??
        []
    );
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    rows[(at + step + rows.length) % rows.length]?.focus();
  };

  const pick = (o: AssignedChipOption) => {
    setOpen(false);
    btn.current?.focus();
    o.onSelect?.();
  };

  const row = (o: AssignedChipOption, radio: boolean) => {
    const OIcon = o.icon;
    const on = radio && !!o.selected;
    return (
      <button
        key={o.id}
        type="button"
        role={radio ? 'menuitemradio' : 'menuitem'}
        aria-checked={radio ? on : undefined}
        onClick={() => pick(o)}
        {...o.anchor}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors focus:outline-hidden focus-visible:bg-slate-100 ${
          on
            ? 'bg-brand-blue-lighter font-bold text-brand-blue-dark'
            : 'font-medium text-slate-700 hover:bg-slate-100'
        }`}
      >
        {OIcon ? (
          <OIcon
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 ${o.iconClass ?? ''}`}
          />
        ) : (
          <span aria-hidden="true" className="h-4 w-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1">{o.label}</span>
        {on && (
          <Check
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-brand-blue-primary"
          />
        )}
      </button>
    );
  };

  return (
    <div ref={wrap} className="flex min-w-0">
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${ariaLabel}: ${label}`}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        {...anchor}
        className={`touch-target-expand relative inline-flex max-w-full items-center rounded-md font-semibold transition-colors hover:bg-slate-100 aria-expanded:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 ${textClass}`}
        style={{
          fontSize: 'min(12.5px, 3.6cqmin)',
          gap: 'min(5px, 1.2cqmin)',
          paddingInline: 'min(4px, 1cqmin)',
          paddingBlock: 'min(3px, 0.8cqmin)',
        }}
      >
        {dot && (
          <span
            aria-hidden="true"
            className="shrink-0 rounded-full bg-current"
            style={{
              width: 'min(6px, 1.5cqmin)',
              height: 'min(6px, 1.5cqmin)',
            }}
          />
        )}
        {Icon && (
          <Icon
            aria-hidden="true"
            className="shrink-0"
            strokeWidth={2.5}
            style={ICON_SIZE}
          />
        )}
        <span className="min-w-0 text-left [overflow-wrap:anywhere]">
          {label}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="shrink-0 text-slate-400"
          style={{
            width: 'min(14px, 3.8cqmin)',
            height: 'min(14px, 3.8cqmin)',
          }}
        />
      </button>
      {open &&
        pos &&
        !disabled &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={ariaLabel}
            data-click-outside-ignore="true"
            onKeyDown={onMenuKey}
            onClick={(e) => e.stopPropagation()}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              minWidth: MENU_WIDTH,
              zIndex: Z_INDEX.popover,
            }}
          >
            {options.map((o) => row(o, true))}
            {footer && (
              <>
                <div
                  role="separator"
                  className="my-1 border-t border-slate-200"
                />
                {row(footer, false)}
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};
