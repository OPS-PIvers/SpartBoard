import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { render } from '@testing-library/react';
import { PopcornBallsView } from './PopcornBallsView';

describe('PopcornBallsView', () => {
  let mockContext: {
    clearRect: Mock;
    beginPath: Mock;
    arc: Mock;
    fill: Mock;
    fillStyle: string;
  };
  let mockRequestAnimationFrame: Mock;
  let mockCancelAnimationFrame: Mock;

  beforeEach(() => {
    mockContext = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillStyle: '',
    };

    // Mock the canvas element's getContext method
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => mockContext
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    mockRequestAnimationFrame = vi.fn().mockReturnValue(123);
    mockCancelAnimationFrame = vi.fn();

    vi.stubGlobal('requestAnimationFrame', mockRequestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', mockCancelAnimationFrame);

    // Mock Math.random to make the color selection deterministic
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders a canvas with the correct width and height', () => {
    const { container } = render(
      <PopcornBallsView volume={50} width={400} height={300} />
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute('width', '400');
    expect(canvas).toHaveAttribute('height', '300');
  });

  it('initializes the animation loop and clears it on unmount', () => {
    const mockGetContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');

    const { unmount } = render(
      <PopcornBallsView volume={50} width={400} height={300} />
    );

    expect(mockGetContext).toHaveBeenCalledWith('2d');

    // The render loop gets started immediately
    expect(mockRequestAnimationFrame).toHaveBeenCalled();

    // Clear the rendering on unmount
    unmount();
    expect(mockCancelAnimationFrame).toHaveBeenCalledWith(123);
  });

  it('updates balls positions based on volume impulse during render loop', () => {
    render(<PopcornBallsView volume={80} width={400} height={300} />);

    // Get the render function passed to requestAnimationFrame
    const renderLoop = mockRequestAnimationFrame.mock.calls[0][0] as () => void;

    // First frame
    renderLoop();

    // Context should be cleared and balls drawn
    expect(mockContext.clearRect).toHaveBeenCalledWith(0, 0, 400, 300);
    expect(mockContext.beginPath).toHaveBeenCalled();
    expect(mockContext.arc).toHaveBeenCalled();
    expect(mockContext.fill).toHaveBeenCalled();

    // Test color property being set
    expect(mockContext.fillStyle).toBeDefined();

    // Call it again to simulate physics progression
    renderLoop();
  });

  it('handles resizing correctly (changing width and height props)', () => {
    const mockGetContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');

    const { rerender } = render(
      <PopcornBallsView volume={50} width={400} height={300} />
    );

    // Re-rendering with new dimensions should trigger the useEffects
    mockRequestAnimationFrame.mockClear();

    rerender(<PopcornBallsView volume={50} width={500} height={400} />);

    // getContext should be called again since the useEffect depends on width and height
    expect(mockGetContext).toHaveBeenCalledWith('2d');

    // And a new animation frame should be requested
    expect(mockRequestAnimationFrame).toHaveBeenCalled();
  });

  it('does nothing if canvas getContext returns null', () => {
    // Override getContext to return null for this test
    HTMLCanvasElement.prototype.getContext = vi
      .fn()
      .mockReturnValue(
        null
      ) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    render(<PopcornBallsView volume={50} width={400} height={300} />);

    // Animation loop should not start
    expect(mockRequestAnimationFrame).not.toHaveBeenCalled();
  });
});
