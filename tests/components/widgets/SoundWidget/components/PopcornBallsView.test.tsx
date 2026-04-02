import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PopcornBallsView } from '../../../../../components/widgets/SoundWidget/components/PopcornBallsView';
import React from 'react';

describe('PopcornBallsView', () => {
  let originalRequestAnimationFrame: typeof requestAnimationFrame;
  let originalCancelAnimationFrame: typeof cancelAnimationFrame;
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    originalGetContext = HTMLCanvasElement.prototype.getContext;

    let mockId = 0;
    window.requestAnimationFrame = vi
      .fn()
      .mockImplementation((cb: FrameRequestCallback) => {
        mockId++;
        // Instead of calling it synchronously (which causes an infinite loop since render calls requestAnimationFrame again)
        // We simulate an async frame call.
        setTimeout(() => cb(performance.now()), 0);
        return mockId;
      });
    window.cancelAnimationFrame = vi.fn();

    // Mock canvas getContext
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    vi.restoreAllMocks();
  });

  it('renders canvas with correct width and height', () => {
    const { container } = render(
      <PopcornBallsView volume={50} width={400} height={300} />
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute('width', '400');
    expect(canvas).toHaveAttribute('height', '300');
  });

  it('starts and stops animation on mount and unmount', () => {
    const { unmount } = render(
      <PopcornBallsView volume={50} width={400} height={300} />
    );
    expect(window.requestAnimationFrame).toHaveBeenCalled();
    unmount();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });
});
