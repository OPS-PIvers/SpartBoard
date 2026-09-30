import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '@/hooks/useClickOutside';

const EDGE = 12;
const GAP = 6;

interface GradebookPopoverShellProps {
  anchor: HTMLElement;
  onClose: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}

/** Anchored panel for the gradebook: below the anchor, flipped above when it would overflow. */
export const GradebookPopoverShell: React.FC<GradebookPopoverShellProps> = ({
  anchor,
  onClose,
  ariaLabel,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useClickOutside(panelRef, (e) => {
    if (!anchor.contains(e.target as Node)) onClose();
  });

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const pw = panel.offsetWidth;
      const ph = panel.offsetHeight;
      const left = Math.max(
        EDGE,
        Math.min(r.left, window.innerWidth - pw - EDGE)
      );
      let top = r.bottom + GAP;
      if (top + ph > window.innerHeight - EDGE) {
        top = Math.max(EDGE, r.top - ph - GAP);
      }
      setPos((p) =>
        p && p.top === top && p.left === left ? p : { top, left }
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
  }, [anchor]);

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
    <div
      ref={panelRef}
      role="dialog"
      aria-label={ariaLabel}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
      }}
      className="fixed z-popover flex max-h-[min(640px,calc(100dvh-24px))] w-[min(380px,calc(100vw-24px))] flex-col gap-4 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 pb-5 text-sm text-slate-800 shadow-xl outline-none"
    >
      {children}
    </div>,
    document.body
  );
};
