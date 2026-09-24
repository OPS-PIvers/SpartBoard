import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useResumeOffer, writeResume } from './useResume';

afterEach(() => window.localStorage.clear());

const saveLocal = (idx: number) =>
  writeResume({ id: 'set', idx, mode: 'try', updatedAt: Date.now() });

describe('useResumeOffer (P8-8 cross-device resume)', () => {
  it('offers the server’s furthest step when this device saved nothing', () => {
    const { result } = renderHook(() => useResumeOffer('set', 5, true, 3));
    expect(result.current[0]).toEqual({ idx: 3, source: 'server' });
  });

  it('prefers this device’s saved place over the server', () => {
    saveLocal(2);
    const { result } = renderHook(() => useResumeOffer('set', 5, true, 4));
    expect(result.current[0]).toEqual({ idx: 2, source: 'device' });
  });

  it('never offers the server step when this device saved the first step', () => {
    saveLocal(0);
    const { result } = renderHook(() => useResumeOffer('set', 5, true, 4));
    expect(result.current[0]).toBeNull();
  });

  it('ignores a server step at the start or out of range, and when disabled', () => {
    for (const idx of [0, 5, 9]) {
      const { result } = renderHook(() => useResumeOffer('set', 5, true, idx));
      expect(result.current[0]).toBeNull();
    }
    const { result } = renderHook(() => useResumeOffer('set', 5, false, 3));
    expect(result.current[0]).toBeNull();
  });

  it('offers a server step that arrives after opening, until the learner moves', () => {
    const { result, rerender } = renderHook(
      ({ server, pristine }: { server?: number; pristine: boolean }) =>
        useResumeOffer('set', 5, true, server, pristine),
      {
        initialProps: { server: undefined, pristine: true } as {
          server?: number;
          pristine: boolean;
        },
      }
    );
    expect(result.current[0]).toBeNull();
    rerender({ server: 3, pristine: true });
    expect(result.current[0]).toEqual({ idx: 3, source: 'server' });
    act(() => result.current[1]());
    expect(result.current[0]).toBeNull();

    const moved = renderHook(
      ({ server, pristine }: { server?: number; pristine: boolean }) =>
        useResumeOffer('set', 5, true, server, pristine),
      {
        initialProps: { server: undefined, pristine: false } as {
          server?: number;
          pristine: boolean;
        },
      }
    );
    moved.rerender({ server: 3, pristine: false });
    expect(moved.result.current[0]).toBeNull();
  });
});
