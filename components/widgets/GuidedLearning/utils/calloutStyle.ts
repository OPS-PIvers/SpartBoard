import type { GuidedLearningCalloutTone, GuidedLearningStep } from '@/types';

export const CALLOUT_WIDTH_PCT_MIN = 10;
export const CALLOUT_WIDTH_PCT_MAX = 95;
export const CALLOUT_SCALE_MIN = 0.75;
export const CALLOUT_SCALE_MAX = 2;
export const CALLOUT_TONES: readonly GuidedLearningCalloutTone[] = [
  'dark',
  'light',
  'accent',
];

type CalloutStyleFields = Pick<
  GuidedLearningStep,
  'calloutWidthPct' | 'calloutScale' | 'calloutTone'
>;

/** True when the step draws a tooltip or popover the style fields apply to. */
export function stepHasCallout(
  step: Pick<GuidedLearningStep, 'interactionType' | 'showOverlay'>
): boolean {
  if (step.interactionType === 'tooltip') return true;
  if (step.interactionType === 'text-popover') return true;
  return (
    (step.interactionType === 'pan-zoom' ||
      step.interactionType === 'spotlight' ||
      step.interactionType === 'pan-zoom-spotlight') &&
    (step.showOverlay === 'tooltip' || step.showOverlay === 'popover')
  );
}

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(Math.max(n, lo), hi);

export const clampCalloutWidthPct = (pct: number): number =>
  clamp(pct, CALLOUT_WIDTH_PCT_MIN, CALLOUT_WIDTH_PCT_MAX);

export const clampCalloutScale = (scale: number): number =>
  clamp(scale, CALLOUT_SCALE_MIN, CALLOUT_SCALE_MAX);

export const isCalloutTone = (v: unknown): v is GuidedLearningCalloutTone =>
  CALLOUT_TONES.includes(v as GuidedLearningCalloutTone);

/** Stored width clamped for rendering; undefined = auto width. */
export function calloutWidthPctOf(
  step: CalloutStyleFields
): number | undefined {
  return isNum(step.calloutWidthPct)
    ? clampCalloutWidthPct(step.calloutWidthPct)
    : undefined;
}

/** Stored scale clamped for rendering; 1 when absent. */
export function calloutScaleOf(step: CalloutStyleFields): number {
  return isNum(step.calloutScale) ? clampCalloutScale(step.calloutScale) : 1;
}

export function calloutToneOf(
  step: CalloutStyleFields
): GuidedLearningCalloutTone {
  return isCalloutTone(step.calloutTone) ? step.calloutTone : 'dark';
}

/** True when a callout step renders any schema-v4 field; leftovers on other types and 'dark' don't count. */
export function stepUsesCalloutStyle(
  step: CalloutStyleFields &
    Pick<GuidedLearningStep, 'interactionType' | 'showOverlay'>
): boolean {
  return (
    stepHasCallout(step) &&
    (step.calloutWidthPct !== undefined ||
      step.calloutScale !== undefined ||
      (step.calloutTone !== undefined && step.calloutTone !== 'dark'))
  );
}

/** Import check: every present callout style field is in range. */
export function isValidCalloutStyle(step: CalloutStyleFields): boolean {
  const { calloutWidthPct: w, calloutScale: s, calloutTone: tone } = step;
  if (
    w !== undefined &&
    (!isNum(w) || w < CALLOUT_WIDTH_PCT_MIN || w > CALLOUT_WIDTH_PCT_MAX)
  ) {
    return false;
  }
  if (
    s !== undefined &&
    (!isNum(s) || s < CALLOUT_SCALE_MIN || s > CALLOUT_SCALE_MAX)
  ) {
    return false;
  }
  return tone === undefined || isCalloutTone(tone);
}

export interface CalloutToneStyle {
  /** Tooltip card background, border and text colour. */
  tooltipCard: string;
  /** Text popover card background, border and text colour. */
  popoverCard: string;
  title: string;
  body: string;
  closeButton: string;
  /** Leader line and arrowhead colour, with a halo so it reads on any slide. */
  line: string;
  halo: string;
  /** Studio toolbar swatch. */
  swatch: string;
  /** i18n key for the swatch's name. */
  labelKey: string;
}

// Dark matches the pre-v4 cards; Light and Accent keep text at AA contrast or better.
export const CALLOUT_TONE_STYLES: Record<
  GuidedLearningCalloutTone,
  CalloutToneStyle
> = {
  dark: {
    tooltipCard:
      'bg-slate-900/90 backdrop-blur-xl text-white border border-white/20 ring-1 ring-black/40',
    popoverCard:
      'bg-slate-800/95 backdrop-blur-sm text-white border border-white/20',
    title: 'text-white',
    body: 'text-slate-100',
    closeButton: 'text-slate-300 hover:text-white',
    line: 'rgba(255,255,255,0.85)',
    halo: 'rgba(15,23,42,0.55)',
    swatch: 'bg-slate-900 border border-white/40',
    labelKey: 'glStudio.calloutToneDark',
  },
  light: {
    tooltipCard:
      'bg-white text-slate-900 border border-slate-300 ring-1 ring-black/10',
    popoverCard: 'bg-white text-slate-900 border border-slate-300',
    title: 'text-slate-900',
    body: 'text-slate-700',
    closeButton: 'text-slate-500 hover:text-slate-900',
    line: 'rgb(15,23,42)',
    halo: 'rgba(255,255,255,0.85)',
    swatch: 'bg-white border border-slate-400',
    labelKey: 'glStudio.calloutToneLight',
  },
  accent: {
    tooltipCard:
      'bg-[var(--spart-primary,#2d3f89)] text-white border border-white/25 ring-1 ring-black/30',
    popoverCard:
      'bg-[var(--spart-primary,#2d3f89)] text-white border border-white/25',
    title: 'text-white',
    body: 'text-white',
    closeButton: 'text-white/80 hover:text-white',
    line: 'var(--spart-primary, #2d3f89)',
    halo: 'rgba(255,255,255,0.85)',
    swatch: 'bg-[var(--spart-primary,#2d3f89)] border border-white/40',
    labelKey: 'glStudio.calloutToneAccent',
  },
};
