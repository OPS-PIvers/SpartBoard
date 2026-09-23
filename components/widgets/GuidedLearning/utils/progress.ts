// Step analytics (GL Studio plan P2-5): the progress doc shape, event aggregation and Results summaries.
import type { PlaybackMode, StepEvent } from '../types/stage';

/** Misclick positions kept per step, in image-%. */
export const MAX_CLICKS_PER_STEP = 20;
/** Mirrors the rules' cap on the `steps` map. */
export const MAX_TRACKED_STEPS = 200;

export interface StepProgress {
  ms: number;
  misclicks: number;
  hinted: boolean;
  clicks?: { x: number; y: number }[];
}

/** Firestore `guided_learning_sessions/{id}/progress/{uid}` minus the timestamps. */
export interface GuidedLearningProgress {
  mode?: PlaybackMode;
  modeSwitches: number;
  furthestStepIdx: number;
  completed: boolean;
  steps: Record<string, StepProgress>;
}

export const emptyProgress = (): GuidedLearningProgress => ({
  modeSwitches: 0,
  furthestStepIdx: 0,
  completed: false,
  steps: {},
});

const roundPct = (v: number) =>
  Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;

/** Folds one player event into the progress doc. `stepIdx` is the step's position in the set. */
export function applyStepEvent(
  prev: GuidedLearningProgress,
  e: StepEvent,
  stepIdx: number,
  lastIdx: number
): GuidedLearningProgress {
  const step: StepProgress = prev.steps[e.stepId] ?? {
    ms: 0,
    misclicks: 0,
    hinted: false,
  };
  const next: GuidedLearningProgress = { ...prev };
  let nextStep = step;
  if (e.mode && e.mode !== prev.mode) {
    if (prev.mode) next.modeSwitches = prev.modeSwitches + 1;
    next.mode = e.mode;
  }
  switch (e.type) {
    case 'enter':
      if (stepIdx >= 0)
        next.furthestStepIdx = Math.max(prev.furthestStepIdx, stepIdx);
      break;
    case 'leave':
      nextStep = { ...step, ms: step.ms + Math.max(0, Math.round(e.ms)) };
      break;
    case 'misclick': {
      nextStep = { ...step, misclicks: step.misclicks + 1 };
      const clicks = step.clicks ?? [];
      if (
        e.xPct !== undefined &&
        e.yPct !== undefined &&
        clicks.length < MAX_CLICKS_PER_STEP
      ) {
        nextStep.clicks = [
          ...clicks,
          { x: roundPct(e.xPct), y: roundPct(e.yPct) },
        ];
      }
      break;
    }
    case 'hint':
      nextStep = { ...step, hinted: true };
      break;
    case 'complete':
      if (stepIdx === lastIdx) next.completed = true;
      break;
  }
  const isNew = !prev.steps[e.stepId];
  const hasRoom = Object.keys(prev.steps).length < MAX_TRACKED_STEPS;
  if ((nextStep !== step || isNew) && (!isNew || hasRoom)) {
    next.steps = { ...prev.steps, [e.stepId]: nextStep };
  }
  return next;
}

/** Reads a stored doc defensively; anything malformed falls back to empty values. */
export function parseProgressDoc(raw: unknown): GuidedLearningProgress {
  const d = (raw ?? {}) as Record<string, unknown>;
  const steps: Record<string, StepProgress> = {};
  if (d.steps && typeof d.steps === 'object') {
    for (const [id, v] of Object.entries(d.steps as Record<string, unknown>)) {
      const s = (v ?? {}) as Record<string, unknown>;
      steps[id] = {
        ms: typeof s.ms === 'number' ? s.ms : 0,
        misclicks: typeof s.misclicks === 'number' ? s.misclicks : 0,
        hinted: s.hinted === true,
        ...(Array.isArray(s.clicks)
          ? {
              clicks: (s.clicks as { x?: unknown; y?: unknown }[])
                .filter(
                  (c) => typeof c?.x === 'number' && typeof c?.y === 'number'
                )
                .map((c) => ({ x: c.x as number, y: c.y as number })),
            }
          : {}),
      };
    }
  }
  return {
    ...(d.mode === 'watch' || d.mode === 'try' ? { mode: d.mode } : {}),
    modeSwitches: typeof d.modeSwitches === 'number' ? d.modeSwitches : 0,
    furthestStepIdx:
      typeof d.furthestStepIdx === 'number' ? d.furthestStepIdx : 0,
    completed: d.completed === true,
    steps,
  };
}

export interface EngagementSummary {
  viewers: number;
  /** Per step in set order: viewers who reached it and the median time spent. */
  funnel: { stepId: string; reached: number; medianMs: number | null }[];
  /** Misclick dots per slide index, in image-%. */
  misclicksBySlide: Map<number, { x: number; y: number; stepId: string }[]>;
  split: Record<PlaybackMode, { viewers: number; completed: number }>;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function summarizeEngagement(
  docs: GuidedLearningProgress[],
  steps: { id: string; imageIndex: number }[]
): EngagementSummary {
  const funnel = steps.map((step, idx) => {
    const times: number[] = [];
    let reached = 0;
    for (const d of docs) {
      if (d.furthestStepIdx >= idx) reached += 1;
      const ms = d.steps[step.id]?.ms;
      if (ms) times.push(ms);
    }
    return { stepId: step.id, reached, medianMs: median(times) };
  });
  const slideOf = new Map(steps.map((s) => [s.id, s.imageIndex]));
  const misclicksBySlide = new Map<
    number,
    { x: number; y: number; stepId: string }[]
  >();
  for (const d of docs) {
    for (const [stepId, s] of Object.entries(d.steps)) {
      const slide = slideOf.get(stepId);
      if (slide === undefined || !s.clicks?.length) continue;
      const dots = misclicksBySlide.get(slide) ?? [];
      for (const c of s.clicks) dots.push({ ...c, stepId });
      misclicksBySlide.set(slide, dots);
    }
  }
  const split: EngagementSummary['split'] = {
    watch: { viewers: 0, completed: 0 },
    try: { viewers: 0, completed: 0 },
  };
  for (const d of docs) {
    if (!d.mode) continue;
    split[d.mode].viewers += 1;
    if (d.completed) split[d.mode].completed += 1;
  }
  return { viewers: docs.length, funnel, misclicksBySlide, split };
}
