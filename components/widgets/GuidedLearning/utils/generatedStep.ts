import type { GuidedLearningStep } from '@/types';
import {
  clampCalloutBox,
  isCalloutTone,
  isValidCalloutBox,
  stepHasCallout,
} from './calloutStyle';
import { clampRegion } from './regionGeometry';

type StepBase = Pick<
  GuidedLearningStep,
  'id' | 'xPct' | 'yPct' | 'imageIndex' | 'interactionType'
>;

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(Math.max(n, lo), hi);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const OVERLAYS = ['popover', 'tooltip', 'banner'] as const;
const BANNER_TONES = ['blue', 'red', 'neutral'] as const;
const ZOOMS = ['pan-zoom', 'pan-zoom-spotlight'];
const SPOTLIGHTS = ['spotlight', 'pan-zoom-spotlight'];
const OVERLAY_TYPES = ['pan-zoom', 'spotlight', 'pan-zoom-spotlight'];

const pick = <T extends string>(v: unknown, allowed: readonly T[]) =>
  allowed.includes(v as T) ? (v as T) : undefined;

/** Keeps only the fields the AI generator may write, clamped to the Studio's ranges; drafts start unreviewed. */
export function cleanGeneratedStep(
  raw: Record<string, unknown>,
  base: StepBase
): GuidedLearningStep {
  const step: GuidedLearningStep = { ...base, aiDraft: true };
  const type = base.interactionType;
  if (typeof raw.label === 'string') step.label = raw.label;
  if (typeof raw.text === 'string') step.text = raw.text;
  if (isNum(raw.autoAdvanceDuration) && raw.autoAdvanceDuration > 0) {
    step.autoAdvanceDuration = raw.autoAdvanceDuration;
  }
  if (type === 'question' && isRecord(raw.question)) {
    step.question = raw.question as unknown as GuidedLearningStep['question'];
  }
  step.showOverlay = OVERLAY_TYPES.includes(type)
    ? (pick(raw.showOverlay, OVERLAYS) ?? 'none')
    : 'none';
  if (step.showOverlay === 'banner') {
    const tone = pick(raw.bannerTone, BANNER_TONES);
    if (tone) step.bannerTone = tone;
  }
  if (ZOOMS.includes(type) && isNum(raw.panZoomScale)) {
    step.panZoomScale = clamp(raw.panZoomScale, 1.5, 6);
  }
  if (SPOTLIGHTS.includes(type) && isNum(raw.spotlightRadius)) {
    step.spotlightRadius = clamp(raw.spotlightRadius, 5, 50);
  }

  const r = raw.region;
  if (
    type !== 'question' &&
    isRecord(r) &&
    (r.shape === 'rect' || r.shape === 'ellipse') &&
    isNum(r.wPct) &&
    isNum(r.hPct)
  ) {
    const { centre, region } = clampRegion(
      { xPct: base.xPct, yPct: base.yPct },
      {
        shape: r.shape,
        wPct: r.wPct,
        hPct: r.hPct,
        ...(r.shape === 'rect' && isNum(r.cornerPct)
          ? { cornerPct: r.cornerPct }
          : {}),
      }
    );
    step.region = region;
    step.xPct = centre.xPct;
    step.yPct = centre.yPct;
  }

  if (stepHasCallout(step)) {
    if (isValidCalloutBox(raw.calloutBox) && isRecord(raw.calloutBox)) {
      step.calloutBox = clampCalloutBox(
        raw.calloutBox as unknown as NonNullable<
          GuidedLearningStep['calloutBox']
        >
      );
    }
    // An explicit 'dark' stays absent; no tone from the model means the new-step default.
    if (!isCalloutTone(raw.calloutTone)) step.calloutTone = 'light';
    else if (raw.calloutTone !== 'dark') step.calloutTone = raw.calloutTone;
  }
  if (isRecord(raw.cursor) && raw.cursor.hide === true) {
    step.cursor = { hide: true };
  }
  return step;
}
