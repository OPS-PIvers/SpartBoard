import { useRef, useState, type KeyboardEvent } from 'react';
import { useClickOutside } from '@/hooks/useClickOutside';

/** Open state for a select-style button's menu: closes on outside click and on Escape without closing the dialog. */
export function usePickMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useClickOutside(rootRef, () => {
    if (open) setOpen(false);
  });
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || !open) return;
    e.stopPropagation();
    setOpen(false);
  };
  return { open, setOpen, rootRef, onKeyDown };
}
