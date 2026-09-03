import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WaveformScrubber } from '@/components/quiz/recording/WaveformScrubber';

const peaks = new Float32Array([0.2, 0.9, 0.1, 0.0, 0.5]);
const silent = [false, false, true, true, false];

function renderScrubber(currentMs = 10_000, onSeek = vi.fn()) {
  const utils = render(
    <WaveformScrubber
      peaks={peaks}
      silent={silent}
      durationMs={60_000}
      currentMs={currentMs}
      markers={[{ id: 'm1', ms: 30_000 }]}
      onSeek={onSeek}
    />
  );
  const slider = screen.getByRole('slider');
  vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
    x: 100,
    y: 0,
    left: 100,
    top: 0,
    right: 500,
    bottom: 48,
    width: 400,
    height: 48,
    toJSON: () => ({}),
  } as DOMRect);
  return { ...utils, slider, onSeek };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WaveformScrubber', () => {
  it('exposes slider aria attributes in whole seconds', () => {
    const { slider } = renderScrubber(10_400);
    expect(slider).toHaveAttribute('aria-label', 'Playback position');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '60');
    expect(slider).toHaveAttribute('aria-valuenow', '10');
    expect(slider).toHaveAttribute('tabindex', '0');
  });

  it('maps a pointer click x to milliseconds', () => {
    const { slider, onSeek } = renderScrubber();
    fireEvent.pointerDown(slider, { clientX: 300, button: 0, pointerId: 1 });
    expect(onSeek).toHaveBeenCalledWith(30_000);
  });

  it('follows pointer drag and stops after pointer up', () => {
    const { slider, onSeek } = renderScrubber();
    fireEvent.pointerDown(slider, { clientX: 100, button: 0, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 200, pointerId: 1 });
    fireEvent.pointerUp(slider, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 400, pointerId: 1 });
    expect(onSeek).toHaveBeenNthCalledWith(1, 0);
    expect(onSeek).toHaveBeenNthCalledWith(2, 15_000);
    expect(onSeek).toHaveBeenCalledTimes(2);
  });

  it('clamps clicks outside the track', () => {
    const { slider, onSeek } = renderScrubber();
    fireEvent.pointerDown(slider, { clientX: 900, button: 0, pointerId: 1 });
    expect(onSeek).toHaveBeenCalledWith(60_000);
  });

  it('ArrowRight seeks forward 2 seconds and ArrowLeft back', () => {
    const { slider, onSeek } = renderScrubber(10_000);
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onSeek).toHaveBeenCalledWith(12_000);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(onSeek).toHaveBeenCalledWith(8_000);
  });

  it('Home seeks to 0 and End to the duration', () => {
    const { slider, onSeek } = renderScrubber(10_000);
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onSeek).toHaveBeenCalledWith(60_000);
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(onSeek).toHaveBeenCalledWith(0);
  });

  it('ignores unrelated keys', () => {
    const { slider, onSeek } = renderScrubber();
    fireEvent.keyDown(slider, { key: 'a' });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('renders a hidden canvas for the waveform', () => {
    const { container } = renderScrubber();
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas).toHaveAttribute('aria-hidden');
  });
});
