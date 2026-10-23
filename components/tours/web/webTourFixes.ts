// Suggested fixes for web tour steps that missed or played weak (C14-C16).
import {
  WEB_TOUR_ATTR_KEYS,
  type GuidedLearningSet,
  type GuidedLearningStep,
  type WebTourLocator,
  type WebTourSuggestion,
} from '@/types';
import type { TourRun } from '@/components/tours/tourRuns';
import { parseWeak } from './webTourHealth';
import { scrubLocator } from './recordedSteps';
import { targetsSignature } from './webStepReview';

/** Teacher runs must agree on a fix this many times before it shows (C16). */
export const MIN_TEACHER_RUNS = 2;

/** The clues a fix is compared by; position and page title change with the window, so they stay out. */
export const FIX_CLUES = ['role', 'name', 'text', 'css', 'heading'] as const;

// Must match fixKey in functions/src/mcp/webTourFixes.ts.
const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
};

/** Fingerprint of a locator's identifying clues. */
export function fixKey(locator: WebTourLocator | undefined): string {
  const parts: string[] = FIX_CLUES.map((k) => locator?.[k] ?? '');
  for (const k of WEB_TOUR_ATTR_KEYS) parts.push(locator?.attrs?.[k] ?? '');
  return fnv(JSON.stringify(parts));
}

interface FixGroup {
  locator: WebTourLocator;
  count: number;
  admin: boolean;
  at: number;
}

const struggled = (run: TourRun, stepId: string) =>
  run.misses.includes(stepId) ||
  (run.weak ?? []).some((w) => parseWeak(w)?.stepId === stepId);

/** The fix runs of this version agree on most, per step; a teacher-only fix needs MIN_TEACHER_RUNS runs, an admin's own run one. */
export function runSuggestions(
  runs: readonly TourRun[],
  version: number,
  published: readonly GuidedLearningStep[]
): Map<string, WebTourSuggestion> {
  const groups = new Map<string, Map<string, FixGroup>>();
  for (const run of runs) {
    if (run.v !== version || run.surface !== 'web' || !run.fixes) continue;
    for (const [stepId, locator] of Object.entries(run.fixes)) {
      if (!struggled(run, stepId)) continue;
      const byKey = groups.get(stepId) ?? new Map<string, FixGroup>();
      groups.set(stepId, byKey);
      const key = fixKey(locator);
      const g = byKey.get(key) ?? { locator, count: 0, admin: false, at: 0 };
      g.count++;
      if (run.admin === true) g.admin = true;
      g.at = Math.max(g.at, run.startedAt);
      byKey.set(key, g);
    }
  }
  const out = new Map<string, WebTourSuggestion>();
  for (const step of published) {
    const byKey = groups.get(step.id);
    if (!step.web || !byKey) continue;
    const shown = [...byKey.values()]
      .filter((g) => g.admin || g.count >= MIN_TEACHER_RUNS)
      .sort((a, b) => Number(b.admin) - Number(a.admin) || b.count - a.count);
    const best = shown[0];
    if (!best) continue;
    out.set(step.id, {
      locator: best.locator,
      source: best.admin ? 'admin' : 'teacher',
      count: best.count,
      at: best.at,
      base: fixKey(step.web.locator),
    });
  }
  return out;
}

/** The fix to show on a step: a check run's first, then runs'; none once the step changed, already uses it, or the admin dismissed it. */
export function suggestionFor(
  set: Pick<GuidedLearningSet, 'webSuggestions' | 'webFixDismissed'>,
  step: GuidedLearningStep,
  fromRuns: ReadonlyMap<string, WebTourSuggestion>
): WebTourSuggestion | null {
  const locator = step.web?.locator;
  if (!locator) return null;
  const current = fixKey(locator);
  const dismissed = set.webFixDismissed?.[step.id];
  const usable = (s: WebTourSuggestion | undefined) =>
    !!s &&
    s.base === current &&
    fixKey(s.locator) !== current &&
    fixKey(s.locator) !== dismissed;
  const check = set.webSuggestions?.[step.id];
  if (usable(check)) return check ?? null;
  const run = fromRuns.get(step.id);
  return usable(run) ? (run ?? null) : null;
}

const withoutStep = <T>(map: Record<string, T> | undefined, stepId: string) => {
  const { [stepId]: _gone, ...rest } = map ?? {};
  return rest;
};

/** Puts the suggested clues on the step, keeping its frames; this changes the targets, so the last check expires (C13). */
export function applyFix(
  set: GuidedLearningSet,
  stepId: string,
  fix: WebTourSuggestion
): GuidedLearningSet {
  return {
    ...set,
    steps: set.steps.map((s) => {
      if (s.id !== stepId || !s.web) return s;
      const { frames, box } = s.web.locator;
      const { frames: _frames, ...clues } = scrubLocator(fix.locator);
      // A fix from a subframe has no box, so the old one stays.
      const kept = clues.box ?? box;
      return {
        ...s,
        web: {
          ...s.web,
          locator: {
            ...clues,
            ...(kept ? { box: kept } : {}),
            ...(frames ? { frames } : {}),
          },
        },
      };
    }),
    webSuggestions: withoutStep(set.webSuggestions, stepId),
  };
}

/** Hides this fix on the step until a different one comes. */
export const dismissFix = (
  set: GuidedLearningSet,
  stepId: string,
  fix: WebTourSuggestion
): GuidedLearningSet => ({
  ...set,
  webSuggestions: withoutStep(set.webSuggestions, stepId),
  webFixDismissed: { ...set.webFixDismissed, [stepId]: fixKey(fix.locator) },
});

/** Saves a check run's suggestion when the targets are still the ones it played. */
export function recordCheckSuggestion(
  set: GuidedLearningSet,
  sig: string,
  stepId: string,
  locator: WebTourLocator,
  at: number
): GuidedLearningSet {
  const step = set.steps.find((s) => s.id === stepId);
  if (!step?.web || targetsSignature(set) !== sig) return set;
  const { frames: _frames, ...clues } = scrubLocator(locator);
  const old = set.webSuggestions?.[stepId];
  if (old && fixKey(old.locator) === fixKey(clues)) return set;
  return {
    ...set,
    webSuggestions: {
      ...set.webSuggestions,
      [stepId]: {
        locator: clues,
        source: 'check',
        count: 1,
        at,
        base: fixKey(step.web.locator),
      },
    },
  };
}
