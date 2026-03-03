import { describe, it, expect } from 'vitest';
import {
  CSS_PPI,
  estimatePPI,
  inchesToPx,
  cmToPx,
  isStickerTool,
  getPatternBlockPoints,
  FRACTION_COLORS,
  PATTERN_BLOCK_COLORS,
  ALGEBRA_TILE_META,
  TOOL_SUB_ITEMS,
} from './mathToolUtils';

// ---------------------------------------------------------------------------
// estimatePPI
// ---------------------------------------------------------------------------
describe('estimatePPI', () => {
  it('always returns CSS_PPI (96)', () => {
    expect(estimatePPI()).toBe(CSS_PPI);
    expect(estimatePPI()).toBe(96);
  });
});

// ---------------------------------------------------------------------------
// unit conversion helpers
// ---------------------------------------------------------------------------
describe('inchesToPx', () => {
  it('converts 1 inch to 96px at default CSS_PPI', () => {
    expect(inchesToPx(1)).toBe(96);
  });

  it('respects a custom ppi value', () => {
    expect(inchesToPx(1, 72)).toBe(72);
    expect(inchesToPx(2, 100)).toBe(200);
  });
});

describe('cmToPx', () => {
  it('converts 2.54 cm to 96px at default CSS_PPI (1 inch)', () => {
    expect(cmToPx(2.54)).toBeCloseTo(96);
  });

  it('respects a custom ppi value', () => {
    expect(cmToPx(2.54, 72)).toBeCloseTo(72);
  });
});

// ---------------------------------------------------------------------------
// isStickerTool
// ---------------------------------------------------------------------------
describe('isStickerTool', () => {
  it('returns true for ruler/protractor sticker tools', () => {
    expect(isStickerTool('ruler-in')).toBe(true);
    expect(isStickerTool('ruler-cm')).toBe(true);
    expect(isStickerTool('protractor')).toBe(true);
  });

  it('returns true for manipulative sticker tools', () => {
    expect(isStickerTool('base-10')).toBe(true);
    expect(isStickerTool('fraction-tiles')).toBe(true);
    expect(isStickerTool('pattern-blocks')).toBe(true);
    expect(isStickerTool('algebra-tiles')).toBe(true);
  });

  it('returns false for interactive widget tools', () => {
    expect(isStickerTool('number-line')).toBe(false);
    expect(isStickerTool('calculator')).toBe(false);
    expect(isStickerTool('geoboard')).toBe(false);
    expect(isStickerTool('coordinate-plane')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getPatternBlockPoints
// ---------------------------------------------------------------------------
describe('getPatternBlockPoints', () => {
  const shapes = [
    'hexagon',
    'trapezoid',
    'triangle',
    'rhombus-wide',
    'rhombus-narrow',
    'square',
  ] as const;

  shapes.forEach((shape) => {
    it(`returns a non-empty string with no NaN for ${shape}`, () => {
      const result = getPatternBlockPoints(shape, 28);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      // Must not contain NaN — that would break SVG rendering
      expect(result).not.toContain('NaN');
    });
  });

  it('scales with unitSize: larger unit → larger coordinate values', () => {
    const small = getPatternBlockPoints('square', 10);
    const large = getPatternBlockPoints('square', 40);
    // Parse all finite numbers and compare the maximum absolute value
    const maxAbs = (s: string) =>
      Math.max(
        ...s
          .split(/[\s,]+/)
          .map(Number)
          .filter(isFinite)
          .map(Math.abs)
      );
    expect(maxAbs(large)).toBeGreaterThan(maxAbs(small));
  });

  it('returns different strings for different unitSizes', () => {
    expect(getPatternBlockPoints('hexagon', 10)).not.toBe(
      getPatternBlockPoints('hexagon', 40)
    );
  });

  it('does not throw for an unknown shape', () => {
    expect(() => getPatternBlockPoints('unknown-shape', 28)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// FRACTION_COLORS (single source of truth)
// ---------------------------------------------------------------------------
describe('FRACTION_COLORS', () => {
  const expectedDenominators = [1, 2, 3, 4, 5, 6, 8, 10, 12];

  it('has an entry for every standard denominator', () => {
    expectedDenominators.forEach((d) => {
      expect(FRACTION_COLORS[d]).toBeDefined();
    });
  });

  it('all colour values are valid 6-digit CSS hex colours', () => {
    expectedDenominators.forEach((d) => {
      expect(FRACTION_COLORS[d]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});

// ---------------------------------------------------------------------------
// PATTERN_BLOCK_COLORS (single source of truth)
// ---------------------------------------------------------------------------
describe('PATTERN_BLOCK_COLORS', () => {
  const shapes = [
    'hexagon',
    'trapezoid',
    'triangle',
    'rhombus-wide',
    'rhombus-narrow',
    'square',
  ];

  it('has an entry for every pattern block shape', () => {
    shapes.forEach((shape) => {
      expect(PATTERN_BLOCK_COLORS[shape]).toBeDefined();
    });
  });

  it('all colour values are valid 6-digit CSS hex colours', () => {
    shapes.forEach((shape) => {
      expect(PATTERN_BLOCK_COLORS[shape]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});

// ---------------------------------------------------------------------------
// ALGEBRA_TILE_META (single source of truth)
// ---------------------------------------------------------------------------
describe('ALGEBRA_TILE_META', () => {
  const kinds = [
    'x2-pos',
    'x2-neg',
    'x-pos',
    'x-neg',
    'unit-pos',
    'unit-neg',
  ] as const;

  it('has an entry for every algebra tile kind', () => {
    kinds.forEach((kind) => {
      expect(ALGEBRA_TILE_META[kind]).toBeDefined();
    });
  });

  it('each entry has a fill colour, stroke, and label', () => {
    kinds.forEach((kind) => {
      const meta = ALGEBRA_TILE_META[kind];
      expect(meta.fill).toBeTruthy();
      expect(meta.stroke).toBeTruthy();
      expect(meta.label).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// TOOL_SUB_ITEMS — algebra tile IDs must match AlgebraTileKind
// ---------------------------------------------------------------------------
describe('TOOL_SUB_ITEMS algebra-tiles sub-items', () => {
  const items = TOOL_SUB_ITEMS['algebra-tiles'] ?? [];

  it('uses unit-pos and unit-neg (not the renamed one-pos/one-neg)', () => {
    const ids = items.map((item) => item.id);
    expect(ids).toContain('unit-pos');
    expect(ids).toContain('unit-neg');
    expect(ids).not.toContain('one-pos');
    expect(ids).not.toContain('one-neg');
  });

  it('includes all 6 expected tile kinds', () => {
    const ids = items.map((item) => item.id);
    expect(ids).toContain('x2-pos');
    expect(ids).toContain('x2-neg');
    expect(ids).toContain('x-pos');
    expect(ids).toContain('x-neg');
  });
});
