import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LEARNER_SPEED_KEY,
  readLearnerSpeed,
  useLearnerSpeed,
} from './useLearnerSpeed';

describe('useLearnerSpeed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('defaults to 1x and remembers a choice across mounts', () => {
    const first = renderHook(() => useLearnerSpeed());
    expect(first.result.current[0]).toBe(1);
    act(() => first.result.current[1](0.5));
    expect(first.result.current[0]).toBe(0.5);
    expect(window.localStorage.getItem(LEARNER_SPEED_KEY)).toBe('0.5');
    first.unmount();

    const second = renderHook(() => useLearnerSpeed());
    expect(second.result.current[0]).toBe(0.5);
  });

  it('ignores a stored value that is not an offered speed', () => {
    window.localStorage.setItem(LEARNER_SPEED_KEY, '3');
    expect(readLearnerSpeed()).toBe(1);
  });

  it('still works when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useLearnerSpeed());
    expect(result.current[0]).toBe(1);
    act(() => result.current[1](1.5));
    expect(result.current[0]).toBe(1.5);
  });
});
