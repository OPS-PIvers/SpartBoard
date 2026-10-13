import { describe, it, expect } from 'vitest';
import { clampZoom, stepZoom, MAX_ZOOM, MIN_ZOOM } from './useStimulusZoom';

describe('stepZoom', () => {
  it('moves to the neighbouring preset step', () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
  });

  it('snaps an off-step pinch zoom to the next preset in that direction', () => {
    expect(stepZoom(1.37, 1)).toBe(1.5);
    expect(stepZoom(1.37, -1)).toBe(1.25);
  });

  it('stays at the ends of the range', () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });
});

describe('clampZoom', () => {
  it('keeps pinch zoom inside the supported range', () => {
    expect(clampZoom(10)).toBe(MAX_ZOOM);
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(1.7)).toBe(1.7);
  });
});
