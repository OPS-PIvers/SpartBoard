import { useEffect, useRef, type RefObject } from 'react';
import { useWidgetHostRef } from './WidgetHostContext';

// Closes a portalled menu on host geometry changes (Alt+M/Alt+R/resize-drag, none fire 'resize'); WidgetHostContext first, `.closest()` fallback for providerless menus.
export function useCloseOnHostResize(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  onClose: () => void
): void {
  const hostRefFromContext = useWidgetHostRef();
  const onCloseRef = useRef(onClose);
  // eslint-disable-next-line react-hooks/refs -- intentional render-body ref sync (CLAUDE.md pattern)
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const host =
      hostRefFromContext?.current ??
      anchorRef.current?.closest<HTMLElement>('[data-draggable-window]');
    if (!host || typeof ResizeObserver === 'undefined') return undefined;
    // ResizeObserver.observe() always fires once immediately, even with no size change.
    let skippedInitial = false;
    const observer = new ResizeObserver(() => {
      if (!skippedInitial) {
        skippedInitial = true;
        return;
      }
      onCloseRef.current();
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [open, hostRefFromContext, anchorRef]);
}
