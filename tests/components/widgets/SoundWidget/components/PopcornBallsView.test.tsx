import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PopcornBallsView } from '@/components/widgets/SoundWidget/components/PopcornBallsView';
import React from 'react';

describe('PopcornBallsView', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
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
