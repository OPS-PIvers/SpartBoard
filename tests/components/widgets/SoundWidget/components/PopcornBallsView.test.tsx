import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PopcornBallsView } from '@/components/widgets/SoundWidget/components/PopcornBallsView';
import React from 'react';

// Capture the ResizeObserver callback so tests can drive a synthetic resize.
// jsdom has no layout engine, so the component's own-container measurement
// must be simulated by invoking the observer callback with a contentRect.
let resizeCallback: ResizeObserverCallback | null = null;

class MockResizeObserver {
  constructor(cb: ResizeObserverCallback) {
    resizeCallback = cb;
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

function emitResize(target: Element, width: number, height: number): void {
  act(() => {
    resizeCallback?.(
      [
        {
          target,
          contentRect: { width, height } as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ],
      {} as ResizeObserver
    );
  });
}

describe('PopcornBallsView', () => {
  beforeEach(() => {
    resizeCallback = null;
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sizes the canvas from its measured container, not from props', () => {
    const { container } = render(<PopcornBallsView volume={50} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    // Before any measurement the canvas buffer is zero-sized.
    expect(canvas).toHaveAttribute('width', '0');
    expect(canvas).toHaveAttribute('height', '0');

    const measured = container.querySelector('div');
    emitResize(measured as Element, 400, 300);

    expect(canvas).toHaveAttribute('width', '400');
    expect(canvas).toHaveAttribute('height', '300');
  });

  it('starts animation once measured and stops it on unmount', () => {
    const { container, unmount } = render(<PopcornBallsView volume={50} />);
    // No animation until the container has a non-zero measured size.
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();

    const measured = container.querySelector('div');
    emitResize(measured as Element, 400, 300);

    expect(window.requestAnimationFrame).toHaveBeenCalled();
    unmount();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });
});
