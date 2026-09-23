import { useLayoutEffect, useState } from 'react';

/**
 * Compute viewport-relative coordinates for a popover anchored under a
 * trigger button. Clamped 8px in from the right edge so the popover
 * never tucks under the modal close button on tight widths.
 */
export const usePopoverPosition = (
  open: boolean,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  width: number
): { top: number; left: number } | null => {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportW =
        typeof window !== 'undefined' ? window.innerWidth : rect.right;
      const left = Math.max(8, Math.min(rect.left, viewportW - width - 8));
      setPos({ top: rect.bottom + 4, left });
    };
    update();
    // Reposition on resize / scroll so the popover stays anchored if the
    // user resizes the modal or scrolls the chip into view.
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, triggerRef, width]);
  return pos;
};
