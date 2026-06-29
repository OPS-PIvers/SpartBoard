import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import { useDragScroll } from '@/hooks/useDragScroll';

// `useDragScroll` is pure DOM pointer logic — no React state, no Firestore.
// It attaches pointerdown/move/up/cancel listeners to a scrollable ref and
// disambiguates a drag-to-scroll gesture from a secondary-axis gesture before
// committing. These tests drive it with synthetic PointerEvents (the global
// jsdom PointerEvent mock from tests/setup.ts) and assert against the
// container's scrollLeft/scrollTop, which jsdom tracks as settable properties.

interface PointerInit {
  clientX?: number;
  clientY?: number;
  pointerId?: number;
  pointerType?: string;
  button?: number;
}

/**
 * Build a synthetic PointerEvent. The jsdom PointerEvent mock copies
 * clientX/clientY/pointerId/pointerType but NOT `button`, which the hook's
 * primary-button guard reads — so assign it explicitly (default 0 = primary).
 */
function makePointer(type: string, init: PointerInit = {}): PointerEvent {
  const ev = new PointerEvent(type, init as PointerEventInit);
  Object.defineProperty(ev, 'button', {
    value: init.button ?? 0,
    configurable: true,
  });
  return ev;
}

function mount(
  axis?: 'x' | 'y',
  options?: { disabled?: boolean; minDistance?: number },
  el: HTMLElement = document.createElement('div')
) {
  document.body.appendChild(el);
  const ref: RefObject<HTMLElement | null> = { current: el };
  const view = renderHook(() => useDragScroll(ref, axis, options));
  return { el, ref, ...view };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('useDragScroll', () => {
  describe('horizontal (axis x)', () => {
    it('scrolls when a primary-axis drag commits', () => {
      const { el } = mount('x');
      el.scrollLeft = 50;

      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100 })
      );
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 80, clientY: 100 })
      );

      // scrollLeft = startScrollLeft - dx = 50 - (-20) = 70
      expect(el.scrollLeft).toBe(70);
    });

    it('keeps following the pointer relative to the original start position', () => {
      const { el } = mount('x');
      el.scrollLeft = 50;

      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100 })
      );
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 80, clientY: 100 })
      );
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 60, clientY: 100 })
      );

      // Both moves are measured from the original start (100), not incrementally.
      expect(el.scrollLeft).toBe(90); // 50 - (-40)
    });

    it('hands off to other handlers when the secondary axis dominates', () => {
      const { el } = mount('x');
      el.scrollLeft = 0;

      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100 })
      );
      // Vertical-dominant move on an x-axis scroller → passthrough.
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 100, clientY: 130 })
      );
      // Once in passthrough, further moves are ignored entirely.
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 60, clientY: 160 })
      );

      expect(el.scrollLeft).toBe(0);
    });
  });

  describe('vertical (axis y)', () => {
    it('scrolls when a primary-axis drag commits', () => {
      const { el } = mount('y');
      el.scrollTop = 20;

      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100 })
      );
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 100, clientY: 80 })
      );

      // scrollTop = startScrollTop - dy = 20 - (-20) = 40
      expect(el.scrollTop).toBe(40);
    });

    it('defaults to the x axis when none is supplied', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const ref: RefObject<HTMLElement | null> = { current: el };
      renderHook(() => useDragScroll(ref));
      el.scrollLeft = 10;

      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100 })
      );
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 90, clientY: 100 })
      );

      expect(el.scrollLeft).toBe(20); // 10 - (-10)
    });
  });

  describe('direction disambiguation threshold', () => {
    it('stays undecided (no scroll, no capture) below minDistance', () => {
      const { el } = mount('x');
      const captureSpy = vi.fn();
      el.setPointerCapture = captureSpy;
      el.scrollLeft = 0;

      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100 })
      );
      // sqrt(5^2 + 2^2) ≈ 5.4 < 8 → still undecided
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 105, clientY: 102 })
      );

      expect(el.scrollLeft).toBe(0);
      expect(captureSpy).not.toHaveBeenCalled();
    });

    it('commits once cumulative movement passes minDistance', () => {
      const { el } = mount('x');
      el.scrollLeft = 0;

      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100 })
      );
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 90, clientY: 100 })
      );

      expect(el.scrollLeft).toBe(10); // 0 - (-10)
    });

    it('respects a custom minDistance', () => {
      const { el } = mount('x', { minDistance: 20 });
      el.scrollLeft = 0;

      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100 })
      );
      // 10px move is below the custom 20px threshold → no commit.
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 90, clientY: 100 })
      );
      expect(el.scrollLeft).toBe(0);

      // 25px past start crosses the threshold → commit + scroll.
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 75, clientY: 100 })
      );
      expect(el.scrollLeft).toBe(25); // 0 - (-25)
    });

    it('treats a perfectly diagonal drag as scroll (>= tie-break)', () => {
      const { el } = mount('x');
      const captureSpy = vi.fn();
      el.setPointerCapture = captureSpy;
      el.scrollLeft = 0;

      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100 })
      );
      // adx === ady (10 === 10) → primaryDelta >= secondaryDelta → scrolling.
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 110, clientY: 110 })
      );

      expect(el.scrollLeft).toBe(-10); // 0 - 10
      expect(captureSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('pointer capture lifecycle', () => {
    it('captures on commit and releases on pointerup, then stops scrolling', () => {
      const { el } = mount('x');
      const captureSpy = vi.fn();
      const releaseSpy = vi.fn();
      el.setPointerCapture = captureSpy;
      el.releasePointerCapture = releaseSpy;
      el.scrollLeft = 0;

      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100, pointerId: 7 })
      );
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 80, clientY: 100, pointerId: 7 })
      );
      expect(captureSpy).toHaveBeenCalledWith(7);
      expect(el.scrollLeft).toBe(20);

      el.dispatchEvent(makePointer('pointerup', { pointerId: 7 }));
      expect(releaseSpy).toHaveBeenCalledWith(7);

      // Gesture reset — a further move (same pointer) must not scroll.
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 40, clientY: 100, pointerId: 7 })
      );
      expect(el.scrollLeft).toBe(20);
    });

    it('still scrolls when setPointerCapture throws', () => {
      const { el } = mount('x');
      el.setPointerCapture = vi.fn(() => {
        throw new Error('capture unavailable');
      });
      el.scrollLeft = 0;

      expect(() => {
        el.dispatchEvent(
          makePointer('pointerdown', { clientX: 100, clientY: 100 })
        );
        el.dispatchEvent(
          makePointer('pointermove', { clientX: 80, clientY: 100 })
        );
      }).not.toThrow();
      expect(el.scrollLeft).toBe(20);
    });

    it('resets the gesture on pointercancel', () => {
      const { el } = mount('x');
      el.scrollLeft = 0;

      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100 })
      );
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 80, clientY: 100 })
      );
      expect(el.scrollLeft).toBe(20);

      el.dispatchEvent(makePointer('pointercancel', { pointerId: 1 }));
      // Idle again — subsequent move ignored.
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 40, clientY: 100 })
      );
      expect(el.scrollLeft).toBe(20);
    });

    it('resets via a stray window-level pointerup', () => {
      const { el } = mount('x');
      el.scrollLeft = 0;

      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100 })
      );
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 80, clientY: 100 })
      );
      expect(el.scrollLeft).toBe(20);

      // setPointerCapture may have failed, so pointerup can land on window.
      window.dispatchEvent(makePointer('pointerup', { pointerId: 1 }));
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 40, clientY: 100 })
      );
      expect(el.scrollLeft).toBe(20);
    });
  });

  describe('event suppression', () => {
    it('calls preventDefault and stopPropagation while scrolling', () => {
      const { el } = mount('x');
      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100 })
      );

      const move = makePointer('pointermove', { clientX: 80, clientY: 100 });
      const preventDefault = vi.spyOn(move, 'preventDefault');
      const stopPropagation = vi.spyOn(move, 'stopPropagation');
      el.dispatchEvent(move);

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(stopPropagation).toHaveBeenCalledTimes(1);
    });

    it('does not suppress an undecided (below-threshold) move', () => {
      const { el } = mount('x');
      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100 })
      );

      const move = makePointer('pointermove', { clientX: 103, clientY: 101 });
      const preventDefault = vi.spyOn(move, 'preventDefault');
      el.dispatchEvent(move);

      expect(preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('guards', () => {
    it('ignores a non-primary mouse button on pointerdown', () => {
      const { el } = mount('x');
      const captureSpy = vi.fn();
      el.setPointerCapture = captureSpy;
      el.scrollLeft = 0;

      el.dispatchEvent(
        makePointer('pointerdown', {
          clientX: 100,
          clientY: 100,
          pointerType: 'mouse',
          button: 1, // right/middle — not primary
        })
      );
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 80, clientY: 100 })
      );

      expect(el.scrollLeft).toBe(0);
      expect(captureSpy).not.toHaveBeenCalled();
    });

    it('ignores a second pointer while a gesture is already active', () => {
      const { el } = mount('x');
      el.scrollLeft = 0;

      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 })
      );
      // A second pointerdown must NOT overwrite the in-flight gesture's start.
      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 300, clientY: 300, pointerId: 2 })
      );
      // A move from the second pointer is ignored (pointerId mismatch).
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 280, clientY: 300, pointerId: 2 })
      );
      expect(el.scrollLeft).toBe(0);

      // The original pointer still drives the gesture from its own start (100).
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 80, clientY: 100, pointerId: 1 })
      );
      expect(el.scrollLeft).toBe(20); // 0 - (-20), not measured from 300
    });

    it('ignores a pointermove whose pointerId does not match', () => {
      const { el } = mount('x');
      el.scrollLeft = 0;

      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 })
      );
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 80, clientY: 100, pointerId: 5 })
      );

      expect(el.scrollLeft).toBe(0);
    });

    it('does nothing when disabled', () => {
      const { el } = mount('x', { disabled: true });
      const captureSpy = vi.fn();
      el.setPointerCapture = captureSpy;
      el.scrollLeft = 0;

      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100 })
      );
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 80, clientY: 100 })
      );

      expect(el.scrollLeft).toBe(0);
      expect(captureSpy).not.toHaveBeenCalled();
    });

    it('does not throw when ref.current is null', () => {
      const ref: RefObject<HTMLElement | null> = { current: null };
      expect(() => renderHook(() => useDragScroll(ref, 'x'))).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('removes listeners on unmount', () => {
      const { el, unmount } = mount('x');
      el.scrollLeft = 0;
      unmount();

      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100 })
      );
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 80, clientY: 100 })
      );

      expect(el.scrollLeft).toBe(0);
    });

    it('re-attaches to the latest options after a dependency change', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const ref: RefObject<HTMLElement | null> = { current: el };
      const { rerender } = renderHook(
        ({ disabled }) => useDragScroll(ref, 'x', { disabled }),
        { initialProps: { disabled: true } }
      );

      // Disabled: no listeners.
      el.scrollLeft = 0;
      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100 })
      );
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 80, clientY: 100 })
      );
      expect(el.scrollLeft).toBe(0);

      // Re-enable: listeners attach and the gesture now scrolls.
      rerender({ disabled: false });
      el.dispatchEvent(
        makePointer('pointerdown', { clientX: 100, clientY: 100 })
      );
      el.dispatchEvent(
        makePointer('pointermove', { clientX: 80, clientY: 100 })
      );
      expect(el.scrollLeft).toBe(20);
    });
  });
});
