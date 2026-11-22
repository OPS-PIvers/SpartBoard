// Ctrl+V of a copied image or file, shared by every place that adds a file.
import type React from 'react';
import { useEffect } from 'react';

export const isImageFile = (f: File): boolean => f.type.startsWith('image/');

const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA');

/** Ctrl+V of a copied file; a scope limits it to the scope's dialog, or to the scope itself with 'element'. */
export function usePasteFiles(
  onFiles: (files: File[]) => void,
  disabled: boolean,
  scopeRef?: React.RefObject<HTMLElement | null>,
  accept?: (file: File) => boolean,
  scope: 'dialog' | 'element' = 'dialog'
) {
  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const data = e.clipboardData;
      // An answer box already took this paste for its own picture.
      if (!data || e.defaultPrevented) return;
      if (scopeRef) {
        const pane = scopeRef.current;
        const target = e.target instanceof Element ? e.target : null;
        const dialog =
          scope === 'dialog' ? pane?.closest('[role="dialog"]') : null;
        const inScope = dialog
          ? target?.closest('[role="dialog"]') === dialog
          : !!pane?.contains(target);
        if (!inScope) return;
      }
      const files = Array.from(data.files).filter((f) => !accept || accept(f));
      if (files.length === 0) return;
      // Pasting copied text into a field keeps working as normal.
      if (isEditableTarget(e.target) && data.types.includes('text/plain')) {
        return;
      }
      e.preventDefault();
      onFiles(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [onFiles, disabled, scopeRef, accept, scope]);
}
