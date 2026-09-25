import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import type { ProjectStepState } from '@/types';
import { Z_INDEX } from '@/config/zIndex';
import { tourAttr } from '@/config/tourAnchors';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useCloseOnHostResize } from '@/components/common/useCloseOnHostResize';
import { STEP_STATE_LABELS, STEP_STATE_ORDER } from '../../projectSteps';
import { STATE_STYLES } from '../../stepVisuals';
import { StateMark } from '../../StateMark';

interface StatusPopoverProps {
  widgetId: string;
  anchor: HTMLElement;
  title: string;
  current: ProjectStepState;
  onPick: (state: ProjectStepState) => void;
  onClose: () => void;
}

const WIDTH = 200;

/** D34 — every state one tap away; the caller writes once and closes. */
export const StatusPopover: React.FC<StatusPopoverProps> = ({
  widgetId,
  anchor,
  title,
  current,
  onPick,
  onClose,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLElement | null>(anchor);
  // eslint-disable-next-line react-hooks/refs -- render-body ref sync (CLAUDE.md pattern)
  anchorRef.current = anchor;
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const ignoreRefs = useMemo(() => [anchorRef], []);
  useClickOutside(panelRef, onClose, ignoreRefs);
  useCloseOnHostResize(true, anchorRef, onClose);

  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const height = panelRef.current?.offsetHeight ?? 180;
    const below = rect.bottom + 6;
    const top =
      below + height > window.innerHeight && rect.top - height - 6 > 0
        ? rect.top - height - 6
        : below;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - WIDTH / 2),
      window.innerWidth - WIDTH - 8
    );
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    if (!pos) return;
    panelRef.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus();
  }, [pos]);

  useEffect(() => {
    const close = (): void => onClose();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [onClose]);

  const closeAndReturn = (): void => {
    onClose();
    anchor.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      // Portalled to <body>: keep Escape away from the dashboard's own handler.
      e.stopPropagation();
      closeAndReturn();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const nodes = Array.from(
      panelRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []
    );
    const idx = nodes.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    nodes[(idx + step + nodes.length) % nodes.length]?.focus();
  };

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label={title}
      onKeyDown={onKeyDown}
      {...tourAttr('projects.status-popover', widgetId, 'projects')}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg"
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: WIDTH,
        zIndex: Z_INDEX.popover,
      }}
    >
      <p className="truncate px-3 pb-1 pt-1.5 text-xs font-semibold text-slate-500">
        {title}
      </p>
      {STEP_STATE_ORDER.map((state) => {
        const selected = state === current;
        return (
          <button
            key={state}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            onClick={() => {
              if (!selected) onPick(state);
              closeAndReturn();
            }}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left font-medium text-slate-700 transition-colors hover:bg-slate-100 focus:bg-slate-100 focus:outline-none ${
              selected ? 'bg-slate-50' : ''
            }`}
          >
            <span
              aria-hidden
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${STATE_STYLES[state].tone}`}
            >
              <StateMark state={state} size="14px" />
            </span>
            <span className="flex-1">{STEP_STATE_LABELS[state]}</span>
            {selected && (
              <Check aria-hidden className="h-4 w-4 text-brand-blue-primary" />
            )}
          </button>
        );
      })}
    </div>,
    document.body
  );
};
