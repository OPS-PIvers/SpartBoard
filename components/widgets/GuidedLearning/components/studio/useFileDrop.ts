import type React from 'react';
import { useEffect, useRef, useState } from 'react';

/** Drop-zone handlers that take only OS file drags; anything else passes through untouched. */
export function useFileDrop(
  onFiles: (files: File[]) => void,
  enabled = true
): {
  active: boolean;
  handlers: Pick<
    React.DOMAttributes<HTMLElement>,
    'onDragEnter' | 'onDragOver' | 'onDragLeave' | 'onDrop'
  >;
} {
  const [active, setActive] = useState(false);
  const depthRef = useRef(0);
  // A drag that started in the page (e.g. a dragged <img>) can list "Files" too.
  const inPageDragRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const start = () => {
      inPageDragRef.current = true;
    };
    const end = () => {
      inPageDragRef.current = false;
    };
    document.addEventListener('dragstart', start, true);
    document.addEventListener('dragend', end, true);
    return () => {
      document.removeEventListener('dragstart', start, true);
      document.removeEventListener('dragend', end, true);
    };
  }, [enabled]);

  const takes = (e: React.DragEvent) =>
    enabled &&
    !inPageDragRef.current &&
    (e.dataTransfer?.types?.includes('Files') ?? false);

  // Stopping propagation keeps the board behind the portal from also taking the drop.
  const handlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!takes(e)) return;
      e.preventDefault();
      e.stopPropagation();
      depthRef.current += 1;
      setActive(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!takes(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!takes(e)) return;
      e.stopPropagation();
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) setActive(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!takes(e)) return;
      e.preventDefault();
      e.stopPropagation();
      depthRef.current = 0;
      setActive(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length > 0) onFiles(files);
    },
  };

  return { active: active && enabled, handlers };
}
