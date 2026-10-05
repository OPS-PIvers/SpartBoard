import type { WidgetType } from '@/types';
import { WIDGET_DEFAULTS } from './widgetDefaults';

export interface WidgetEnvelope {
  minSize: { w: number; h: number };
  /** Supported width / height range. */
  aspectRange: { min: number; max: number };
}

export interface EnvelopeSizes {
  min: { w: number; h: number };
  default: { w: number; h: number };
  large: { w: number; h: number };
  maximized: { w: number; h: number };
  widest: { w: number; h: number };
  tallest: { w: number; h: number };
}

export const GENERIC_MIN_SIZE = { w: 150, h: 100 } as const;
export const GENERIC_ASPECT_RANGE = { min: 0.25, max: 4 } as const;

export const LARGE_SIZE = { w: 1400, h: 900 } as const;
export const MAXIMIZED_SIZE = { w: 1920, h: 1080 } as const;

// Floors that differ from the generic default; only these lift a stored size on render.
const EXPLICIT_MIN_SIZES: Partial<
  Record<WidgetType, { w: number; h: number }>
> = {
  // Small on purpose: a bookmark that reads like a floating icon.
  url: { w: 80, h: 80 },
  // min(w,h) must stay above ~240 so the pyramid's cqmin clamp() floors never bind.
  'blooms-taxonomy': { w: 280, h: 300 },
};

export const WIDGET_TYPES_WITH_EXPLICIT_MIN: ReadonlySet<WidgetType> = new Set(
  Object.keys(EXPLICIT_MIN_SIZES) as WidgetType[]
);

const ALL_WIDGET_TYPES = Object.keys(WIDGET_DEFAULTS) as WidgetType[];

export const WIDGET_ENVELOPES: Record<WidgetType, WidgetEnvelope> =
  Object.fromEntries(
    ALL_WIDGET_TYPES.map((type) => [
      type,
      {
        minSize: { ...(EXPLICIT_MIN_SIZES[type] ?? GENERIC_MIN_SIZE) },
        aspectRange: { ...GENERIC_ASPECT_RANGE },
      },
    ])
  ) as Record<WidgetType, WidgetEnvelope>;

export const getWidgetMinSize = (type: WidgetType): { w: number; h: number } =>
  WIDGET_ENVELOPES[type].minSize;

export const hasExplicitMinSize = (type: WidgetType): boolean =>
  WIDGET_TYPES_WITH_EXPLICIT_MIN.has(type);

// Largest box of the given aspect that fits inside the large size, raised to the min size.
const fitAspect = (
  aspect: number,
  min: { w: number; h: number }
): { w: number; h: number } => {
  let w: number = LARGE_SIZE.w;
  let h = w / aspect;
  if (h > LARGE_SIZE.h) {
    h = LARGE_SIZE.h;
    w = h * aspect;
  }
  if (w < min.w) {
    w = min.w;
    h = w / aspect;
  }
  if (h < min.h) {
    h = min.h;
    w = h * aspect;
  }
  return {
    w: Math.round(Math.min(w, MAXIMIZED_SIZE.w)),
    h: Math.round(Math.min(h, MAXIMIZED_SIZE.h)),
  };
};

export const envelopeSizes = (type: WidgetType): EnvelopeSizes => {
  const { minSize, aspectRange } = WIDGET_ENVELOPES[type];
  const defaults = WIDGET_DEFAULTS[type];
  return {
    min: { ...minSize },
    default: {
      w: defaults.w ?? minSize.w,
      h: defaults.h ?? minSize.h,
    },
    large: { ...LARGE_SIZE },
    maximized: { ...MAXIMIZED_SIZE },
    widest: fitAspect(aspectRange.max, minSize),
    tallest: fitAspect(aspectRange.min, minSize),
  };
};
