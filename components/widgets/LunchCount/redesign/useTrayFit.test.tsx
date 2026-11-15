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
  board.appendChild(tray);
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

  const observeResizes = () => {
    const observer: { notify: ResizeObserverCallback } = {
      notify: () => undefined,
    };
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          observer.notify = cb;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      }
    );
    const frames = new Map<number, FrameRequestCallback>();
    let next = 1;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.set(next, cb);
      return next++;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const flush = () => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((cb) => cb(0));
      return pending.length;
    };
    return { observer, flush };
  };
  const resized = (target: Element) =>
    [{ target }] as unknown as ResizeObserverEntry[];

  it('refits a tray-only resize on the next frame, once', () => {
    const { observer, flush } = observeResizes();
    let roomy = true;
    const tray = setup('column', (t) => roomy || scale(t) <= 0.8);
    expect(tray.style.getPropertyValue('--tray-scale')).toBe('1');
    roomy = false;
    observer.notify(resized(tray), {} as ResizeObserver);
    observer.notify(resized(tray), {} as ResizeObserver);
    expect(tray.style.getPropertyValue('--tray-scale')).toBe('1');
    expect(flush()).toBe(1);
    expect(tray.style.getPropertyValue('--tray-scale')).toBe('0.8');
  });

  it('refits a board resize right away', () => {
    const { observer, flush } = observeResizes();
    let roomy = true;
    const tray = setup('column', (t) => roomy || scale(t) <= 0.8);
    roomy = false;
    observer.notify(
      resized(tray.parentElement as Element),
      {} as ResizeObserver
    );
    expect(tray.style.getPropertyValue('--tray-scale')).toBe('0.8');
    expect(flush()).toBe(0);
  });

  it('shrinks stacked tray text no further than 60%', () => {
    const tray = setup('column', () => false);
    expect(tray.style.getPropertyValue('--tray-scale')).toBe('0.6');
  });
});
