import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { usePageSpellCheck } from './usePageSpellCheck';

describe('usePageSpellCheck', () => {
  afterEach(() => document.documentElement.removeAttribute('spellcheck'));

  it('leaves the page alone while spell check stays on', () => {
    renderHook(() => usePageSpellCheck(false));
    expect(document.documentElement.hasAttribute('spellcheck')).toBe(false);
  });

  it('turns spell check off on the page root', () => {
    renderHook(() => usePageSpellCheck(true));
    expect(document.documentElement.getAttribute('spellcheck')).toBe('false');
  });

  it('restores spell check when switched back on or unmounted', () => {
    const { rerender, unmount } = renderHook(
      ({ off }) => usePageSpellCheck(off),
      { initialProps: { off: true } }
    );
    rerender({ off: false });
    expect(document.documentElement.hasAttribute('spellcheck')).toBe(false);
    rerender({ off: true });
    unmount();
    expect(document.documentElement.hasAttribute('spellcheck')).toBe(false);
  });
});
