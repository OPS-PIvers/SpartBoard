import type {
  GuidedLearningStep,
  GuidedLearningTourAction,
  GuidedLearningTourBinding,
} from '@/types';
import {
  TOUR_ANCHORS,
  WHOLE_BOARD_ANCHOR,
  isTourAnchorId,
  parseTourAnchorRef,
} from '@/config/tourAnchors';
import { TOOLS } from '@/config/tools';

/** `board` plays as a centred card; `missing` and `unregistered` show red in the outline. */
export type TourStepStatus =
  | 'ok'
  | 'board'
  | 'unbound'
  | 'missing'
  | 'unregistered';

export const tourStepStatus = (
  step: Pick<GuidedLearningStep, 'id' | 'tour'>,
  missing: readonly string[]
): TourStepStatus => {
  const anchor = step.tour?.anchor;
  if (!step.tour || anchor === WHOLE_BOARD_ANCHOR) return 'board';
  if (!anchor) return 'unbound';
  if (!isTourAnchorId(parseTourAnchorRef(anchor).id)) return 'unregistered';
  return missing.includes(step.id) ? 'missing' : 'ok';
};

export const isRedStatus = (status: TourStepStatus): boolean =>
  status === 'missing' || status === 'unregistered';

/** The registry label for a step's control, with its widget for per-widget anchors. */
export const tourControlLabel = (
  binding: Pick<GuidedLearningTourBinding, 'anchor'> | undefined
): string | null => {
  if (!binding?.anchor) return null;
  const { id, widgetType } = parseTourAnchorRef(binding.anchor);
  if (!isTourAnchorId(id)) return null;
  const label = TOUR_ANCHORS[id].label;
  const widget = widgetType
    ? TOOLS.find((tool) => tool.type === widgetType)?.label
    : undefined;
  return widget ? `${label}: ${widget}` : label;
};

export const TOUR_ACTIONS: readonly GuidedLearningTourAction[] = [
  'click',
  'toggle',
  'select',
  'type',
  'observe',
];

/** Switches a binding's kind, keeping a value only where the new kind uses one of that shape. */
export function withAction(
  tour: GuidedLearningTourBinding,
  action: GuidedLearningTourAction
): GuidedLearningTourBinding {
  const next: GuidedLearningTourBinding = { ...tour, action };
  delete next.value;
  if (action === 'toggle')
    next.value = typeof tour.value === 'boolean' ? tour.value : true;
  if (action === 'select' || action === 'type')
    next.value = typeof tour.value === 'string' ? tour.value : '';
  return next;
}
