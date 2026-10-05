import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useClickOutside } from './useClickOutside';

describe('useClickOutside', () => {
  const elementsToCleanup: HTMLElement[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    elementsToCleanup.forEach((el) => {
      if (document.body.contains(el)) {
        document.body.removeChild(el);
      }
    });
    elementsToCleanup.length = 0;
  });

  // Helper — dispatches a `pointerdown` that bubbles to document, matching
  // the native source event the hook now listens for. Using the raw
  // `Event` constructor (rather than `PointerEvent`) keeps the test
  // resilient across JSDOM versions that have flaky `PointerEvent`
  // constructors; the hook only reads `event.target`, which `Event` provides.
  const dispatchPointerDown = (target: EventTarget) => {
    target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  };

  it('should call handler when clicking outside', () => {
    const handler = vi.fn();
    const div = document.createElement('div');
    const ref = { current: div };
    document.body.appendChild(div);
    elementsToCleanup.push(div);

    renderHook(() => useClickOutside(ref, handler));

    dispatchPointerDown(document.body);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should call handler when touching outside', () => {
    const handler = vi.fn();
    const div = document.createElement('div');
    const ref = { current: div };
    document.body.appendChild(div);
    elementsToCleanup.push(div);

    renderHook(() => useClickOutside(ref, handler));

    // Touch interactions dispatch `pointerdown` (pointerType = 'touch')
    // ahead of any compatibility `touchstart`/`mousedown`.
    dispatchPointerDown(document.body);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should not call handler when clicking inside', () => {
    const handler = vi.fn();
    const div = document.createElement('div');
    const ref = { current: div };
    document.body.appendChild(div);
    elementsToCleanup.push(div);

    renderHook(() => useClickOutside(ref, handler));

    dispatchPointerDown(ref.current);

    expect(handler).not.toHaveBeenCalled();
  });

  it('should not call handler when clicking on element with data-click-outside-ignore', () => {
    const handler = vi.fn();
    const div = document.createElement('div');
    const ref = { current: div };
    document.body.appendChild(div);
    elementsToCleanup.push(div);

    const portalDiv = document.createElement('div');
    portalDiv.dataset.clickOutsideIgnore = 'true';
    const portalChild = document.createElement('button');
    portalDiv.appendChild(portalChild);
    document.body.appendChild(portalDiv);
    elementsToCleanup.push(portalDiv);

    renderHook(() => useClickOutside(ref, handler));

    dispatchPointerDown(portalChild);

    expect(handler).not.toHaveBeenCalled();
  });

  it('should not call handler when clicking on ignored ref', () => {
    const handler = vi.fn();
    const div = document.createElement('div');
    const ignoreDiv = document.createElement('div');
    const ref = { current: div };
    const ignoreRef = { current: ignoreDiv };

    document.body.appendChild(div);
    document.body.appendChild(ignoreDiv);
    elementsToCleanup.push(div, ignoreDiv);

    renderHook(() => useClickOutside(ref, handler, [ignoreRef]));

    dispatchPointerDown(ignoreRef.current);

    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps one document listener and calls the latest handler when the handler changes each render', () => {
    const div = document.createElement('div');
    const ref = { current: div };
    document.body.appendChild(div);
    elementsToCleanup.push(div);
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(
      ({ h }: { h: () => void }) => useClickOutside(ref, () => h()),
      { initialProps: { h: first } }
    );
    rerender({ h: second });
    rerender({ h: second });

    const count = (spy: typeof addSpy) =>
      spy.mock.calls.filter(([type]) => type === 'pointerdown').length;
    expect(count(addSpy)).toBe(1);
    expect(count(removeSpy)).toBe(0);

    dispatchPointerDown(document.body);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
