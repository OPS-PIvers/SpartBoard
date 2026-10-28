import { useEffect } from 'react';

/** Turns browser spell check off for the whole page while `off` is true; the attribute inherits to every text box. */
export const usePageSpellCheck = (off: boolean): void => {
  useEffect(() => {
    if (!off) return;
    const root = document.documentElement;
    root.setAttribute('spellcheck', 'false');
    return () => root.removeAttribute('spellcheck');
  }, [off]);
};
