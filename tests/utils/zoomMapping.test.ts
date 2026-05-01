import { describe, it, expect } from 'vitest';
import {
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  sliderToZoom,
  zoomToSlider,
} from '@/utils/zoomMapping';

describe('zoomMapping', () => {
  describe('sliderToZoom', () => {
    it('maps the slider midpoint to the default zoom (1×)', () => {
      expect(sliderToZoom(50)).toBe(ZOOM_DEFAULT);
    });

    it('maps the bottom of the slider to 0.5×', () => {
      expect(sliderToZoom(0)).toBe(ZOOM_MIN);
    });

    it('maps the top of the slider to 5×', () => {
      expect(sliderToZoom(100)).toBe(ZOOM_MAX);
    });

    it('maps slider value 75 to 3× (300%)', () => {
      // Slider 75 sits halfway through the upper half: (75 - 50) / 50 = 0.5,
      // and zoom = 1 + 0.5 * (5 - 1) = 3.
      expect(sliderToZoom(75)).toBe(3);
    });

    it('clamps slider values outside [0, 100]', () => {
      expect(sliderToZoom(-10)).toBe(ZOOM_MIN);
      expect(sliderToZoom(200)).toBe(ZOOM_MAX);
    });
  });

  describe('zoomToSlider', () => {
    it('maps the default zoom to the slider midpoint', () => {
      expect(zoomToSlider(ZOOM_DEFAULT)).toBe(50);
    });

    it('maps the min zoom to the slider bottom', () => {
      expect(zoomToSlider(ZOOM_MIN)).toBe(0);
    });

    it('maps the max zoom to the slider top', () => {
      expect(zoomToSlider(ZOOM_MAX)).toBe(100);
    });
  });

  describe('round-trip', () => {
    it('sliderToZoom and zoomToSlider are inverses at canonical points', () => {
      [0, 50, 100].forEach((rawValue) => {
        expect(zoomToSlider(sliderToZoom(rawValue))).toBeCloseTo(rawValue, 5);
      });
      [ZOOM_MIN, ZOOM_DEFAULT, 2, ZOOM_MAX].forEach((zoom) => {
        expect(sliderToZoom(zoomToSlider(zoom))).toBeCloseTo(zoom, 2);
      });
    });
  });

  describe('clampZoom', () => {
    it('passes through values inside the range', () => {
      expect(clampZoom(1.5)).toBe(1.5);
    });

    it('clamps values below the minimum', () => {
      expect(clampZoom(0.1)).toBe(ZOOM_MIN);
    });

    it('clamps values above the maximum', () => {
      expect(clampZoom(10)).toBe(ZOOM_MAX);
    });

    it('rounds to two decimals so 0.1 wheel steps do not drift', () => {
      // Float drift case: 0.1 + 0.1 + ... + 0.1 (ten times) === 0.9999999999999999
      let zoom = 0;
      for (let i = 0; i < 10; i++) zoom += 0.1;
      expect(zoom).not.toBe(1);
      expect(clampZoom(zoom)).toBe(1);
    });
  });
});
