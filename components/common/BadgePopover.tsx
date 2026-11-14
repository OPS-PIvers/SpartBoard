import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Z_INDEX } from '@/config/zIndex';
import { scrollMovesAnchor } from '@/utils/domHelpers';
import { useCloseOnHostResize } from './useCloseOnHostResize';

interface BadgePopoverProps {
  triggerLabel: string;
  dialogLabel: string;
  panel: React.ReactNode;
  /** The badge; becomes the button that opens the panel. */
  children: React.ReactNode;
}

const PANEL_WIDTH = 340;
const GAP = 4;
const EDGE = 8;

interface PanelPos {
  left: number;
  /** Below the badge: `top`; flipped above it: `bottom`, both in viewport px. */
  top?: number;
  bottom?: number;
  maxHeight: number;
  checked: boolean;
}

/** Makes a roster badge a button that opens a small panel beneath it, or above it when only that side fits. */
export const BadgePopover: React.FC<BadgePopoverProps> = ({
  triggerLabel,
  dialogLabel,
  panel,
  children,
}) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const ignoreRefs = useMemo(() => [panelRef], []);
  useClickOutside(wrapperRef, () => setOpen(false), ignoreRefs);
  useCloseOnHostResize(open, wrapperRef, () => setOpen(false));

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8)
    );
    setPos({
      left,
      top: rect.bottom + GAP,
      maxHeight: Math.max(0, window.innerHeight - rect.bottom - GAP - EDGE),
      checked: false,
    });
  }, [open]);

  // Flip above the badge when the panel overflows below and there is more room above.
  useLayoutEffect(() => {
    if (!pos || pos.checked || !panelRef.current || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const above = Math.max(0, rect.top - GAP - EDGE);
    const el = panelRef.current;
    // Borders sit inside maxHeight (border-box) but outside scrollHeight.
    const overflows =
      el.scrollHeight + el.offsetHeight - el.clientHeight > pos.maxHeight;
    setPos(
      overflows && above > pos.maxHeight
        ? {
            left: pos.left,
            bottom: window.innerHeight - rect.top + GAP,
            maxHeight: above,
            checked: true,
          }
        : { ...pos, checked: true }
    );
  }, [pos]);

  useEffect(() => {
    if (open && pos) panelRef.current?.focus();
  }, [open, pos]);

  useEffect(() => {
    if (!open) return undefined;
    // Only scrolls that move the badge close it; scrolling the panel or an unrelated pane doesn't.
    const close = (e: Event) => {
      if (scrollMovesAnchor(e, triggerRef.current)) setOpen(false);
    };
    const closeOnResize = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', closeOnResize);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <span ref={wrapperRef} className="inline-flex shrink-0">
      {/* no-tour-anchor: a per-student badge, nothing a tour walks to */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex rounded-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
      >
        {children}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={dialogLabel}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              // Portalled to <body>: keep Escape away from DashboardView's handler.
              e.stopPropagation();
              close();
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: pos.top,
              bottom: pos.bottom,
              left: pos.left,
              maxHeight: pos.maxHeight,
              width: PANEL_WIDTH,
              maxWidth: 'calc(100vw - 16px)',
              zIndex: Z_INDEX.dropdown,
            }}
            className="overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg focus:outline-hidden"
          >
            {panel}
          </div>,
          document.body
        )}
    </span>
  );
};
