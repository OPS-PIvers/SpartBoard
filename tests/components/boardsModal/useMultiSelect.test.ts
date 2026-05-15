import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMultiSelect } from '@/components/boardsModal/useMultiSelect';

describe('useMultiSelect', () => {
  it('starts with no selection', () => {
    const { result } = renderHook(() => useMultiSelect());
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.isSelectMode).toBe(false);
  });

  it('toggles a selection on (and enters select mode)', () => {
    const { result } = renderHook(() => useMultiSelect());
    act(() => result.current.toggle('b1'));
    expect(result.current.selectedIds.has('b1')).toBe(true);
    expect(result.current.isSelectMode).toBe(true);
  });

  it('toggles a selection off (and exits select mode when empty)', () => {
    const { result } = renderHook(() => useMultiSelect());
    act(() => result.current.toggle('b1'));
    act(() => result.current.toggle('b1'));
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.isSelectMode).toBe(false);
  });

  it('clearSelection exits select mode', () => {
    const { result } = renderHook(() => useMultiSelect());
    act(() => result.current.toggle('b1'));
    act(() => result.current.toggle('b2'));
    act(() => result.current.clearSelection());
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.isSelectMode).toBe(false);
  });
});
