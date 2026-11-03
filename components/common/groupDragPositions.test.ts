import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  setGroupDragPositions,
  useGroupDragPositions,
} from './groupDragPositions';

describe('group drag positions', () => {
  afterEach(() => setGroupDragPositions(null));

  it('publishes live positions during a drag and clears on drop', () => {
    const { result } = renderHook(() => useGroupDragPositions());
    expect(result.current).toBeNull();
    const live = new Map([['a', { x: 10, y: 20 }]]);
    act(() => setGroupDragPositions(live));
    expect(result.current?.get('a')).toEqual({ x: 10, y: 20 });
    act(() => setGroupDragPositions(null));
    expect(result.current).toBeNull();
  });
});
