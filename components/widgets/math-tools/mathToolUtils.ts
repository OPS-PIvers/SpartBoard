import { GradeLevel, MathToolType } from '@/types';

/** CSS reference pixels per physical inch (CSS spec definition) */
export const CSS_PPI = 96;

/**
 * Returns the CSS reference PPI (always 96).
 *
 * The CSS spec defines 1in = 96px regardless of devicePixelRatio.
 * devicePixelRatio only converts CSS px to physical device pixels; it does not
 * change the physical size of 1 CSS px. True physical calibration requires the
 * user to measure a known object on screen and set pixelsPerInch manually via
 * widget settings.
 */
export function estimatePPI(): number {
  if (typeof window === 'undefined') return CSS_PPI;
  return CSS_PPI;
}

/** Convert inches to pixels using calibrated PPI */
export function inchesToPx(inches: number, ppi: number = CSS_PPI): number {
  return inches * ppi;
}

/** Convert centimeters to pixels using calibrated PPI */
export function cmToPx(cm: number, ppi: number = CSS_PPI): number {
  return (cm / 2.54) * ppi;
}

export interface MathToolMeta {
  type: MathToolType;
  label: string;
  description: string;
  emoji: string;
  defaultGradeLevels: GradeLevel[];
  /** Default widget width in px when spawned */
  defaultW: number;
  /** Default widget height in px when spawned */
  defaultH: number;
}

/** Canonical list of all math tools with metadata */
export const MATH_TOOL_META: MathToolMeta[] = [
  {
    type: 'ruler-in',
    label: 'Inch Ruler',
    description: 'Standard 12-inch ruler',
    emoji: '📏',
    defaultGradeLevels: ['k-2', '3-5', '6-8', '9-12'],
    defaultW: 12 * CSS_PPI + 40, // 12 inches + padding
    defaultH: 80,
  },
  {
    type: 'ruler-cm',
    label: 'Metric Ruler',
    description: '30 cm metric ruler',
    emoji: '📏',
    defaultGradeLevels: ['k-2', '3-5', '6-8', '9-12'],
    defaultW: Math.round(cmToPx(30)) + 40,
    defaultH: 80,
  },
  {
    type: 'protractor',
    label: 'Protractor',
    description: '180° angle measurement tool',
    emoji: '📐',
    defaultGradeLevels: ['3-5', '6-8', '9-12'],
    defaultW: 300,
    defaultH: 170,
  },
  {
    type: 'number-line',
    label: 'Number Line',
    description: 'Interactive number line (integers, decimals, fractions)',
    emoji: '〰️',
    defaultGradeLevels: ['k-2', '3-5', '6-8'],
    defaultW: 560,
    defaultH: 100,
  },
  {
    type: 'base-10',
    label: 'Base-10 Blocks',
    description: 'Units, rods, flats, and cubes for place value',
    emoji: '🟦',
    defaultGradeLevels: ['k-2', '3-5'],
    defaultW: 480,
    defaultH: 320,
  },
  {
    type: 'fraction-tiles',
    label: 'Fraction Tiles',
    description: 'Fraction bars for comparing equivalencies',
    emoji: '🟩',
    defaultGradeLevels: ['3-5', '6-8'],
    defaultW: 480,
    defaultH: 300,
  },
  {
    type: 'geoboard',
    label: 'Geoboard',
    description: '5×5 peg board for geometry exploration',
    emoji: '🔵',
    defaultGradeLevels: ['k-2', '3-5'],
    defaultW: 320,
    defaultH: 320,
  },
  {
    type: 'pattern-blocks',
    label: 'Pattern Blocks',
    description: 'Geometric shapes for tessellation and patterns',
    emoji: '🔷',
    defaultGradeLevels: ['k-2', '3-5'],
    defaultW: 420,
    defaultH: 360,
  },
  {
    type: 'algebra-tiles',
    label: 'Algebra Tiles',
    description: 'x², x, and unit tiles for modeling expressions',
    emoji: '🟪',
    defaultGradeLevels: ['6-8', '9-12'],
    defaultW: 480,
    defaultH: 320,
  },
  {
    type: 'coordinate-plane',
    label: 'Coordinate Plane',
    description: 'Cartesian coordinate grid with labeled axes',
    emoji: '📊',
    defaultGradeLevels: ['6-8', '9-12'],
    defaultW: 400,
    defaultH: 400,
  },
  {
    type: 'calculator',
    label: 'Calculator',
    description: 'Basic four-function calculator',
    emoji: '🔢',
    defaultGradeLevels: ['3-5', '6-8', '9-12'],
    defaultW: 220,
    defaultH: 300,
  },
];

export function getMathToolMeta(type: MathToolType): MathToolMeta {
  return (
    MATH_TOOL_META.find((m) => m.type === type) ?? {
      type,
      label: type,
      description: '',
      emoji: '🧮',
      defaultGradeLevels: ['k-2', '3-5', '6-8', '9-12'],
      defaultW: 300,
      defaultH: 200,
    }
  );
}

/** Tool types that function as lightweight sticker overlays rather than full interactive widgets */
export const STICKER_TOOL_TYPES: MathToolType[] = [
  'ruler-in',
  'ruler-cm',
  'protractor',
  'base-10',
  'fraction-tiles',
  'pattern-blocks',
  'algebra-tiles',
];

/** Returns true if the given tool type should be treated as a sticker */
export function isStickerTool(type: MathToolType): boolean {
  return STICKER_TOOL_TYPES.includes(type);
}

/** A spawnable sub-item for a manipulative tool (e.g. an individual tile piece) */
export interface ToolSubItem {
  id: string;
  label: string;
  emoji?: string;
  description?: string;
  spawnW: number;
  spawnH: number;
}

/**
 * Sub-items for manipulative tools that spawn individual pieces.
 * Only present for tools in the "sticker-pieces" category.
 */
export const TOOL_SUB_ITEMS: Partial<Record<MathToolType, ToolSubItem[]>> = {
  'base-10': [
    { id: 'unit', label: 'Unit', description: '= 1', spawnW: 80, spawnH: 80 },
    { id: 'rod', label: 'Rod', description: '= 10', spawnW: 68, spawnH: 180 },
    {
      id: 'flat',
      label: 'Flat',
      description: '= 100',
      spawnW: 200,
      spawnH: 200,
    },
    {
      id: 'cube',
      label: 'Cube',
      description: '= 1,000',
      spawnW: 220,
      spawnH: 220,
    },
  ],
  'fraction-tiles': [
    { id: '1-1', label: 'Whole', spawnW: 380, spawnH: 56 },
    { id: '1-2', label: '½', spawnW: 196, spawnH: 56 },
    { id: '1-3', label: '⅓', spawnW: 132, spawnH: 56 },
    { id: '1-4', label: '¼', spawnW: 100, spawnH: 56 },
    { id: '1-5', label: '⅕', spawnW: 82, spawnH: 56 },
    { id: '1-6', label: '⅙', spawnW: 70, spawnH: 56 },
    { id: '1-8', label: '⅛', spawnW: 56, spawnH: 56 },
    { id: '1-10', label: '1/10', spawnW: 48, spawnH: 56 },
    { id: '1-12', label: '1/12', spawnW: 42, spawnH: 56 },
  ],
  'pattern-blocks': [
    { id: 'hexagon', label: 'Hexagon', spawnW: 120, spawnH: 120 },
    { id: 'trapezoid', label: 'Trapezoid', spawnW: 140, spawnH: 80 },
    { id: 'triangle', label: 'Triangle', spawnW: 120, spawnH: 80 },
    { id: 'rhombus-wide', label: 'Wide ◇', spawnW: 120, spawnH: 80 },
    { id: 'rhombus-narrow', label: 'Narrow ◇', spawnW: 80, spawnH: 120 },
    { id: 'square', label: 'Square', spawnW: 90, spawnH: 90 },
  ],
  'algebra-tiles': [
    {
      id: 'x2-pos',
      label: 'x²',
      description: 'positive x² tile',
      spawnW: 130,
      spawnH: 130,
    },
    {
      id: 'x-pos',
      label: 'x',
      description: 'positive x tile',
      spawnW: 130,
      spawnH: 44,
    },
    {
      id: 'unit-pos',
      label: '1',
      description: 'positive unit tile',
      spawnW: 50,
      spawnH: 50,
    },
    {
      id: 'x2-neg',
      label: '−x²',
      description: 'negative x² tile',
      spawnW: 130,
      spawnH: 130,
    },
    {
      id: 'x-neg',
      label: '−x',
      description: 'negative x tile',
      spawnW: 130,
      spawnH: 44,
    },
    {
      id: 'unit-neg',
      label: '−1',
      description: 'negative unit tile',
      spawnW: 50,
      spawnH: 50,
    },
  ],
};

// ---------------------------------------------------------------------------
// Shared colour maps (single source of truth — import instead of duplicating)
// ---------------------------------------------------------------------------

/** Colours for fraction tile bars, keyed by denominator */
export const FRACTION_COLORS: Record<number, string> = {
  1: '#6366f1',
  2: '#f43f5e',
  3: '#f59e0b',
  4: '#10b981',
  5: '#3b82f6',
  6: '#8b5cf6',
  8: '#ec4899',
  10: '#14b8a6',
  12: '#f97316',
};

/** Colours for pattern block shapes */
export const PATTERN_BLOCK_COLORS: Record<string, string> = {
  hexagon: '#f59e0b',
  trapezoid: '#ef4444',
  triangle: '#10b981',
  'rhombus-wide': '#3b82f6',
  'rhombus-narrow': '#8b5cf6',
  square: '#f97316',
};

// ---------------------------------------------------------------------------
// Shared algebra tile metadata (single source of truth for colours + layout)
// ---------------------------------------------------------------------------

/** Kind identifier for all algebra tile variants */
export type AlgebraTileKind =
  | 'x2-pos'
  | 'x2-neg'
  | 'x-pos'
  | 'x-neg'
  | 'unit-pos'
  | 'unit-neg';

/** Visual and layout metadata for one algebra tile kind */
export interface AlgebraTileStyle {
  label: string;
  /** Pixel width in the interactive canvas layout */
  w: number;
  /** Pixel height in the interactive canvas layout */
  h: number;
  fill: string;
  stroke: string;
  textColor: string;
}

/** Canonical styles for all algebra tile kinds — import this instead of duplicating colours */
export const ALGEBRA_TILE_META: Record<AlgebraTileKind, AlgebraTileStyle> = {
  'x2-pos': {
    label: 'x²',
    w: 72,
    h: 72,
    fill: '#a5f3fc',
    stroke: '#0891b2',
    textColor: '#0e7490',
  },
  'x2-neg': {
    label: '−x²',
    w: 72,
    h: 72,
    fill: '#fda4af',
    stroke: '#e11d48',
    textColor: '#be123c',
  },
  'x-pos': {
    label: 'x',
    w: 72,
    h: 18,
    fill: '#bbf7d0',
    stroke: '#16a34a',
    textColor: '#15803d',
  },
  'x-neg': {
    label: '−x',
    w: 72,
    h: 18,
    fill: '#fecaca',
    stroke: '#dc2626',
    textColor: '#b91c1c',
  },
  'unit-pos': {
    label: '1',
    w: 18,
    h: 18,
    fill: '#fef9c3',
    stroke: '#ca8a04',
    textColor: '#92400e',
  },
  'unit-neg': {
    label: '−1',
    w: 18,
    h: 18,
    fill: '#fee2e2',
    stroke: '#ef4444',
    textColor: '#b91c1c',
  },
};

// ---------------------------------------------------------------------------
// Shared pattern block geometry (single source of truth for polygon points)
// ---------------------------------------------------------------------------

/**
 * Returns an SVG polygon `points` string for a pattern block shape centred at
 * the origin (0, 0) with the given unit size.
 */
export function getPatternBlockPoints(shape: string, unitSize: number): string {
  const u = unitSize;
  switch (shape) {
    case 'hexagon': {
      const r = u * 1.15;
      return Array.from({ length: 6 })
        .map((_, i) => {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          return `${r * Math.cos(a)},${r * Math.sin(a)}`;
        })
        .join(' ');
    }
    case 'trapezoid':
      return `${-u},${u * 0.5} ${u},${u * 0.5} ${u * 0.5},${-u * 0.5} ${-u * 0.5},${-u * 0.5}`;
    case 'triangle':
      return `0,${-u} ${-u * 0.87},${u * 0.5} ${u * 0.87},${u * 0.5}`;
    case 'rhombus-wide':
      return `0,${-u * 0.6} ${u},0 0,${u * 0.6} ${-u},0`;
    case 'rhombus-narrow':
      return `0,${-u * 0.8} ${u * 0.5},0 0,${u * 0.8} ${-u * 0.5},0`;
    case 'square':
      return `${-u * 0.6},${-u * 0.6} ${u * 0.6},${-u * 0.6} ${u * 0.6},${u * 0.6} ${-u * 0.6},${u * 0.6}`;
    default:
      return `${-u},${-u} ${u},${-u} ${u},${u} ${-u},${u}`;
  }
}
