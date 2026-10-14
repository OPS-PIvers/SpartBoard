import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useRedoCount } from './useRedoCount';

describe('useRedoCount', () => {
  afterEach(() => localStorage.clear());

  it('keeps the count for the same question across remounts', () => {
    const first = renderHook(() => useRedoCount('s1:r1:q1'));
    act(() => first.result.current[1]());
    act(() => first.result.current[1]());
    first.unmount();
    const again = renderHook(() => useRedoCount('s1:r1:q1'));
    expect(again.result.current[0]).toBe(2);
    const other = renderHook(() => useRedoCount('s1:r1:q2'));
    expect(other.result.current[0]).toBe(0);
  });

  it('counts in memory when there is no key', () => {
    const { result } = renderHook(() => useRedoCount(undefined));
    act(() => result.current[1]());
    expect(result.current[0]).toBe(1);
  });
});
