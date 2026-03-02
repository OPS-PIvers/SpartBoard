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
