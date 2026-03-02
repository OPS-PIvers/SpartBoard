import { GradeLevel, MathToolType } from '@/types';

/** CSS reference pixels per physical inch (CSS spec definition) */
export const CSS_PPI = 96;

/**
 * Attempts to estimate the device's physical DPI by examining devicePixelRatio
 * and known common IFP resolutions. Falls back to the CSS reference value (96).
 *
 * Note: Browser security restrictions prevent truly accurate DPI detection without
 * user calibration. The CSS spec defines 1in = 96px, so this default is correct
 * for screens that honour CSS physical units. Admins can calibrate via settings.
 */
export function estimatePPI(): number {
  if (typeof window === 'undefined') return CSS_PPI;
  // CSS pixels per inch is always 96 by spec – devicePixelRatio only converts
  // CSS px to physical device pixels, but does not change the physical size of 1 CSS px.
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
      id: 'one-pos',
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
      id: 'one-neg',
      label: '−1',
      description: 'negative unit tile',
      spawnW: 50,
      spawnH: 50,
    },
  ],
};
