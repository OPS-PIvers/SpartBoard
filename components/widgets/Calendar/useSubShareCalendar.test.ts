import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useSubShareCalendar } from './useSubShareCalendar';

describe('useSubShareCalendar', () => {
  it('is off outside a share', () => {
    const { result } = renderHook(() => useSubShareCalendar('w1'));

    expect(result.current.active).toBe(false);
    expect(result.current.events).toEqual([]);
  });

  // The widget's event memo depends on this array, so a fresh `[]` per render
  // would re-sort and re-dedupe every calendar on every render, in or out of
  // a share.
  it('returns the same empty array on every render', () => {
    const { result, rerender } = renderHook(() => useSubShareCalendar('w1'));
    const first = result.current.events;
    rerender();

    expect(result.current.events).toBe(first);
  });
});
