import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

const VIEWPORT_MARGIN = 8;

/** Shared behaviour for the card action menus: viewport clamping, outside-click and Escape close, initial focus. */
export const useCardMenu = (
  position: { x: number; y: number },
  onClose: () => void
) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState(position);

  // offsetWidth/Height ignore the zoom-in entrance transform.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    setClamped({
      x: Math.max(
        VIEWPORT_MARGIN,
        Math.min(
          position.x,
          window.innerWidth - el.offsetWidth - VIEWPORT_MARGIN
        )
      ),
      y: Math.max(
        VIEWPORT_MARGIN,
        Math.min(
          position.y,
          window.innerHeight - el.offsetHeight - VIEWPORT_MARGIN
        )
      ),
    });
  }, [position.x, position.y]);

  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      // Keep the Boards modal's own Escape handler from closing the whole modal.
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    }
  };

  return { menuRef, style: { top: clamped.y, left: clamped.x }, onKeyDown };
};
