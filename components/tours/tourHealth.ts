import type { GuidedLearningSet } from '@/types';
import {
  isTourAnchorId,
  parseTourAnchorRef,
  TOUR_ANCHORS,
  type TourAnchorDef,
} from '@/config/tourAnchors';
import { TOOLS } from '@/config/tools';
import { findTourAnchor } from './resolveTourAnchor';
import { tourStepsOf, type TourStep } from './tourSession';
import type { TourRun } from './tourRuns';

export type AnchorProblem =
  | 'unknown-anchor'
  | 'needs-widget-type'
  | 'unexpected-widget-type'
  | 'unknown-widget-type';

/** What is wrong with a step's anchor ref against the registry, or null when it is fine. */
export function anchorProblem(ref: string): AnchorProblem | null {
  const { id, widgetType } = parseTourAnchorRef(ref);
  if (!isTourAnchorId(id)) return 'unknown-anchor';
  const def: TourAnchorDef = TOUR_ANCHORS[id];
  // Per-widget anchors may name a type too; the recorder writes one and the runner matches it.
  if (!def.perWidgetType && !(def.perWidget && widgetType)) {
    return widgetType ? 'unexpected-widget-type' : null;
  }
  if (!widgetType) return 'needs-widget-type';
  return TOOLS.some((tool) => tool.type === widgetType)
    ? null
    : 'unknown-widget-type';
}

export interface TourStepHealth {
  step: TourStep;
  /** 1-based position among all of the set's steps, as the Studio numbers them. */
  number: number;
  problem: AnchorProblem | null;
}

/** Every live-tour step in a set with its registry check. */
export const tourHealthOf = (set: GuidedLearningSet): TourStepHealth[] =>
  tourStepsOf(set).map((step) => ({
    step,
    number: set.steps.indexOf(step) + 1,
    problem: anchorProblem(step.tour.anchor),
  }));

/** Resolves each step on the page as it is now, without presenting anything. */
export const checkAnchorsLive = (
  steps: readonly TourStep[],
  root: ParentNode = document
): Map<string, boolean> =>
  new Map(steps.map((s) => [s.id, findTourAnchor(s.tour, {}, root) !== null]));

export type TourHealthState = 'ok' | 'needs-open' | 'broken';

export type StepHealthReason =
  | AnchorProblem
  | 'field-misses'
  | 'not-on-screen'
  | 'needs-widget'
  | 'widget-not-added'
  | 'needs-panel';

export interface StepHealthVerdict {
  state: TourHealthState;
  reason: StepHealthReason | null;
}

/** Real runs of the version teachers see now: counts and misses by step id. */
export interface TourFieldStats {
  runs: number;
  done: number;
  misses: Map<string, number>;
}

/** Field stats from runs of this version only, so a republished fix clears old misses. */
export function fieldStatsOf(
  runs: readonly TourRun[],
  version: number
): TourFieldStats {
  const current = runs.filter((run) => run.v === version);
  const misses = new Map<string, number>();
  for (const run of current) {
    for (const id of new Set(run.misses)) {
      misses.set(id, (misses.get(id) ?? 0) + 1);
    }
  }
  return {
    runs: current.length,
    done: current.filter((run) => run.done).length,
    misses,
  };
}

/** What a step's anchor needs open before it can be found: its widget, a panel, or nothing. */
export function anchorNeeds(ref: string): 'widget' | 'panel' | null {
  const { id } = parseTourAnchorRef(ref);
  if (!isTourAnchorId(id)) return null;
  const def: TourAnchorDef = TOUR_ANCHORS[id];
  if (def.perWidget) return 'widget';
  return def.panel ? 'panel' : null;
}

/** Broken: unregistered, missed in real runs, or absent with nothing to open; needs-open: on a closed widget or panel. */
export function stepVerdict(
  health: Pick<TourStepHealth, 'step' | 'problem'>,
  setup: GuidedLearningSet['tourSetup'],
  field: TourFieldStats | null,
  onScreen: boolean | undefined
): StepHealthVerdict {
  if (health.problem) return { state: 'broken', reason: health.problem };
  if ((field?.misses.get(health.step.id) ?? 0) > 0) {
    return { state: 'broken', reason: 'field-misses' };
  }
  const needs = anchorNeeds(health.step.tour.anchor);
  const addsWidgets = (setup?.widgets.length ?? 0) > 0;
  if (needs === 'widget' && !addsWidgets) {
    return { state: 'needs-open', reason: 'widget-not-added' };
  }
  if (onScreen === false) {
    if (needs === 'widget')
      return { state: 'needs-open', reason: 'needs-widget' };
    if (needs === 'panel')
      return { state: 'needs-open', reason: 'needs-panel' };
    return { state: 'broken', reason: 'not-on-screen' };
  }
  return { state: 'ok', reason: null };
}

const RANK: Record<TourHealthState, number> = {
  ok: 0,
  'needs-open': 1,
  broken: 2,
};

/** A tour's state is its worst step's. */
export const worstState = (
  states: readonly TourHealthState[]
): TourHealthState =>
  states.reduce<TourHealthState>(
    (worst, s) => (RANK[s] > RANK[worst] ? s : worst),
    'ok'
  );
