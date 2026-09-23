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
  if (!def.perWidgetType) return widgetType ? 'unexpected-widget-type' : null;
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
