import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearTourLayoutOverrides,
  getTourLayoutOverrides,
  setTourLayoutOverrides,
  useTourLayoutOverride,
} from './dashboardCanvasStore';

const place = (xProp: number) => ({
  xProp,
  yProp: 0.1,
  wProp: 0.2,
  hProp: 0.3,
});

describe('tour layout overrides', () => {
  afterEach(() => clearTourLayoutOverrides());

  it('gives a widget its tour layout until cleared', () => {
    const { result } = renderHook(() => useTourLayoutOverride('w1'));
    expect(result.current).toBeUndefined();
    act(() => setTourLayoutOverrides(new Map([['w1', place(0.4)]])));
    expect(result.current).toEqual(place(0.4));
    act(() => clearTourLayoutOverrides());
    expect(result.current).toBeUndefined();
  });

  it('keeps an unchanged entry, so only moved widgets re-render', () => {
    setTourLayoutOverrides(
      new Map([
        ['a', place(0.1)],
        ['b', place(0.2)],
      ])
    );
    const a = getTourLayoutOverrides().get('a');
    setTourLayoutOverrides(
      new Map([
        ['a', place(0.1)],
        ['b', place(0.9)],
      ])
    );
    expect(getTourLayoutOverrides().get('a')).toBe(a);
    expect(getTourLayoutOverrides().get('b')?.xProp).toBe(0.9);
  });
});
