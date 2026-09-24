// Port of toPublicStep and dedupeStepsById (hooks/useGuidedLearningSession.ts);
// guidedLearningPublicStep.cases.json pins both sides.

export interface GlKeyQuestion {
  type: string;
  text?: string;
  choices?: string[];
  correctAnswer?: string;
  matchingPairs?: { left: string; right: string }[];
  sortingItems?: string[];
}

export interface GlKeyStep {
  id: string;
  question?: GlKeyQuestion;
  narration?: { url?: string; durationMs?: number; voice?: string };
  [key: string]: unknown;
}

/**
 * Everything a student's player renders. What is not named here does not reach
 * a student: the question's own key above all, and with it the teacher's live
 * tour binding and the author's uid.
 */
const PRESENTATION_FIELDS = [
  'id',
  'xPct',
  'yPct',
  'imageIndex',
  'label',
  'interactionType',
  'hideStepNumber',
  'hotspotAlwaysHidden',
  'showOverlay',
  'tooltipPosition',
  'tooltipOffset',
  'text',
  'audioUrl',
  'videoUrl',
  'panZoomScale',
  'spotlightRadius',
  'bannerTone',
  'autoAdvanceDuration',
  'region',
  'calloutPin',
  'calloutWidthPct',
  'calloutScale',
  'calloutTone',
  'cursor',
] as const;

const NARRATION_FIELDS = ['url', 'durationMs', 'voice'] as const;

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The client assigns every field and leans on `ignoreUndefinedProperties`,
 * which the Admin SDK does not set: here an absent field is omitted instead,
 * or the write throws.
 */
function defined(
  source: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (source[field] !== undefined) out[field] = source[field];
  }
  return out;
}

export function toGlPublicStep(step: GlKeyStep): Record<string, unknown> {
  const out = defined(step, PRESENTATION_FIELDS);
  if (step.narration) {
    out.narration = defined(step.narration, NARRATION_FIELDS);
  }
  const q = step.question;
  if (!q) return out;
  const text = q.text !== undefined ? { text: q.text } : {};
  if (q.type === 'multiple-choice' && q.choices) {
    out.question = { type: q.type, ...text, choices: shuffled(q.choices) };
  } else if (q.type === 'matching' && q.matchingPairs) {
    out.question = {
      type: q.type,
      ...text,
      matchingLeft: shuffled(q.matchingPairs.map((p) => p.left)),
      matchingRight: shuffled(q.matchingPairs.map((p) => p.right)),
    };
  } else if (q.type === 'sorting' && q.sortingItems) {
    out.question = {
      type: q.type,
      ...text,
      sortingItems: shuffled(q.sortingItems),
    };
  }
  return out;
}

/** Mirrors `dedupeStepsById`: a repeated id must not inflate the step count. */
export function dedupeGlStepsById(steps: GlKeyStep[]): GlKeyStep[] {
  const seen = new Set<string>();
  return steps.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}
