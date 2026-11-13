import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { useTrayFit } from './useTrayFit';

// The tray fits once its width (side column) or text scale reaches the given threshold.
const setup = (
  direction: 'row' | 'column',
  fitsAt: (tray: HTMLElement) => boolean
) => {
  const board = document.createElement('div');
  const tray = document.createElement('section');
  board.style.flexDirection = direction;
  Object.defineProperty(tray, 'clientHeight', { value: 100 });
  Object.defineProperty(tray, 'scrollHeight', {
    get: () => (fitsAt(tray) ? 100 : 200),
  });
  renderHook(() => useTrayFit({ current: board }, { current: tray }, 'k'));
  return tray;
};

const width = (t: HTMLElement) =>
  parseFloat(t.style.getPropertyValue('--tray-w'));
const scale = (t: HTMLElement) =>
  parseFloat(t.style.getPropertyValue('--tray-scale') || '1');

afterEach(() => vi.restoreAllMocks());

describe('useTrayFit', () => {
  it('widens the side column only as far as the names need', () => {
    const tray = setup('row', (t) => width(t) >= 38);
    expect(tray.style.getPropertyValue('--tray-w')).toBe('38%');
    expect(tray.style.getPropertyValue('--tray-scale')).toBe('');
  });

  it('shrinks the text after the side column reaches half the board', () => {
    const tray = setup('row', (t) => width(t) >= 50 && scale(t) <= 0.85);
    expect(tray.style.getPropertyValue('--tray-w')).toBe('50%');
    expect(tray.style.getPropertyValue('--tray-scale')).toBe('0.85');
  });

  it('leaves the stacked tray at full size when the names already fit', () => {
    const tray = setup('column', () => true);
    expect(tray.style.getPropertyValue('--tray-w')).toBe('');
    expect(tray.style.getPropertyValue('--tray-scale')).toBe('1');
  });

  it('shrinks stacked tray text no further than 60%', () => {
    const tray = setup('column', () => false);
    expect(tray.style.getPropertyValue('--tray-scale')).toBe('0.6');
  });
});
