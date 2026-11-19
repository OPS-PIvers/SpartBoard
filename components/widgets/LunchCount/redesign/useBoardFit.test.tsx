import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBoardFit } from './useBoardFit';

// The board fits once the chip scale reaches the given threshold.
const setup = (fitsAt: (scale: number) => boolean) => {
  const board = document.createElement('div');
  const scale = () =>
    parseFloat(board.style.getPropertyValue('--lc-fit') || '1');
  Object.defineProperty(board, 'clientHeight', { value: 100 });
  Object.defineProperty(board, 'clientWidth', { value: 100 });
  Object.defineProperty(board, 'scrollWidth', { value: 100 });
  Object.defineProperty(board, 'scrollHeight', {
    get: () => (fitsAt(scale()) ? 100 : 200),
  });
  renderHook(() => useBoardFit({ current: board }, 'k'));
  return scale;
};

describe('useBoardFit', () => {
  it('keeps full size when everything already fits', () => {
    expect(setup(() => true)()).toBe(1);
  });

  it('settles on the largest scale that fits', () => {
    const scale = setup((s) => s <= 0.6)();
    expect(scale).toBeLessThanOrEqual(0.6);
    expect(scale).toBeGreaterThan(0.58);
  });

  it('stops at the floor when nothing fits', () => {
    expect(setup(() => false)()).toBe(0.25);
  });
});
