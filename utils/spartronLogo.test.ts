import { describe, expect, it } from 'vitest';
import {
  spartronLogoSvg,
  SPARTRON_UNITS_H,
  SPARTRON_UNITS_W,
} from './spartronLogo';

describe('spartronLogoSvg', () => {
  it('scales the lockup proportionally from the requested height', () => {
    const svg = spartronLogoSvg(7);
    const expectedW = (7 * SPARTRON_UNITS_W) / SPARTRON_UNITS_H;
    expect(svg).toContain(`height="7.000mm"`);
    expect(svg).toContain(`width="${expectedW.toFixed(3)}mm"`);
    expect(svg).toContain('aria-label="SPARTRON"');
  });

  it('draws only black pixels and bubbles, nothing tinted', () => {
    const svg = spartronLogoSvg(5);
    expect(svg).not.toMatch(/#(?!000|fff)[0-9a-f]{3,6}/i);
    expect(svg.match(/<rect /g)?.length ?? 0).toBeGreaterThan(100);
    expect(svg.match(/<circle /g)?.length).toBe(9);
  });
});
