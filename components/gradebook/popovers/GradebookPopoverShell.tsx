import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Z_INDEX } from '@/config/zIndex';

const EDGE = 12;
const GAP = 6;
const SUBMENU_ATTR = 'data-gb-submenu';

interface GradebookPopoverShellProps {
  anchor: HTMLElement;
  onClose: () => void;
  ariaLabel: string;
  children: React.ReactNode;
  /** A menu opened from inside a popover: narrower, right-aligned to its button. */
  submenu?: boolean;
}

/** Anchored panel for the gradebook: below the anchor, flipped above when it would overflow. */
export const GradebookPopoverShell: React.FC<GradebookPopoverShellProps> = ({
  anchor,
  onClose,
  ariaLabel,
  children,
  submenu,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);

  useClickOutside(panelRef, (e) => {
    const target = e.target as Element;
    if (anchor.contains(target)) return;
    if (!submenu && target.closest?.(`[${SUBMENU_ATTR}]`)) return;
    onClose();
  });

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const pw = panel.offsetWidth;
      const ph = panel.scrollHeight;
      const start = submenu ? r.right - pw : r.left;
      const left = Math.max(
        EDGE,
        Math.min(start, window.innerWidth - pw - EDGE)
      );
      const below = window.innerHeight - r.bottom - GAP - EDGE;
      const above = r.top - GAP - EDGE;
      const down = below >= Math.min(ph, 240) || below >= above;
      const maxHeight = down ? below : above;
      const top = down ? r.bottom + GAP : r.top - GAP - Math.min(ph, maxHeight);
      setPos((p) =>
        p && p.top === top && p.left === left && p.maxHeight === maxHeight
          ? p
          : { top, left, maxHeight }
      );
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(panel);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, submenu]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      panel.focus({ preventScroll: true });
    }
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      anchor.focus?.();
    }
  };

  return createPortal(
    <>
      {!submenu && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 bg-slate-900/15"
          style={{ zIndex: Z_INDEX.popover - 1 }}
        />
      )}
      <div
        ref={panelRef}
        role="dialog"
        aria-label={ariaLabel}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        {...(submenu ? { [SUBMENU_ATTR]: '' } : {})}
        style={{
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          maxHeight: pos?.maxHeight,
        }}
        className={`fixed flex flex-col overflow-y-auto rounded-xl border border-slate-300 bg-white text-sm text-slate-800 shadow-[0_24px_48px_-12px_rgba(15,23,42,.35),0_8px_16px_-8px_rgba(15,23,42,.2)] outline-none ${
          submenu
            ? 'z-popover-menu w-[280px] gap-1.5 p-1.5'
            : 'z-popover w-[min(380px,calc(100vw-24px))] gap-3.5 p-4'
        }`}
      >
        {children}
      </div>
    </>,
    document.body
  );
};
