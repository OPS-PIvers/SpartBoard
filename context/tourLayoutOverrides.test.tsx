import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearTourLayoutOverrides,
  clearTourWidgetPatches,
  getTourLayoutOverrides,
  getTourWidgetPatches,
  releaseTourRestore,
  setTourLayoutOverrides,
  setTourWidgetPatches,
  useTourLayoutOverride,
  useTourWidgetPatch,
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

describe('tour widget patches', () => {
  afterEach(() => clearTourWidgetPatches());

  it('raises or restores a widget until cleared, keeping unchanged entries', () => {
    const { result } = renderHook(() => useTourWidgetPatch('w1'));
    expect(result.current).toBeUndefined();
    act(() => setTourWidgetPatches(new Map([['w1', { z: 9 }]])));
    expect(result.current).toEqual({ z: 9 });
    const kept = result.current;
    act(() =>
      setTourWidgetPatches(
        new Map([
          ['w1', { z: 9 }],
          ['w2', { restored: true }],
        ])
      )
    );
    expect(result.current).toBe(kept);
    expect(getTourWidgetPatches().get('w2')).toEqual({ restored: true });
    act(() => clearTourWidgetPatches());
    expect(result.current).toBeUndefined();
  });

  it('stops restoring a widget the teacher minimizes, until the tour ends', () => {
    setTourWidgetPatches(new Map([['w1', { restored: true, z: 3 }]]));
    releaseTourRestore('w1');
    expect(getTourWidgetPatches().get('w1')).toEqual({ z: 3 });
    setTourWidgetPatches(new Map([['w1', { restored: true, z: 3 }]]));
    expect(getTourWidgetPatches().get('w1')).toEqual({ z: 3 });
    clearTourWidgetPatches();
    setTourWidgetPatches(new Map([['w1', { restored: true }]]));
    expect(getTourWidgetPatches().get('w1')).toEqual({ restored: true });
  });
});
