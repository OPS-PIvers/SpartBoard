import { describe, it, expect } from 'vitest';
import { COLOR_HEX_TO_NAME, STANDARD_COLORS, WIDGET_PALETTE } from './colors';

describe('COLOR_HEX_TO_NAME', () => {
  it('maps every STANDARD_COLORS entry to its name', () => {
    for (const [name, hex] of Object.entries(STANDARD_COLORS)) {
      expect(COLOR_HEX_TO_NAME[hex]).toBe(name);
    }
  });

  it('maps white to a human-readable name instead of falling through to the raw hex', () => {
    // Regression: white is appended to WIDGET_PALETTE by some consumers
    // (e.g. MusicWidget's textColors) but isn't a STANDARD_COLORS member,
    // so it must be explicitly present here or the `?? c` fallback used by
    // consumers exposes the raw hex string as an accessible name.
    expect(COLOR_HEX_TO_NAME['#ffffff']).toBe('white');
  });

  it('does not add white to WIDGET_PALETTE itself', () => {
    // White is intentionally NOT a first-class palette member — consumers
    // that want it append '#ffffff' explicitly (e.g. [...WIDGET_PALETTE, '#ffffff']).
    expect(WIDGET_PALETTE).not.toContain('#ffffff');
  });
});
