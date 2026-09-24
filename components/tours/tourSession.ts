import { isDestructiveAnchor } from '@/config/tourAnchors';
import type {
  GuidedLearningSet,
  GuidedLearningTourBinding,
  GuidedLearningStep,
  WidgetData,
  WidgetType,
} from '@/types';

export type TourStep = GuidedLearningStep & {
  tour: NonNullable<GuidedLearningStep['tour']>;
};

/** A set's live-tour steps, in authored order. */
export const tourStepsOf = (set: GuidedLearningSet): TourStep[] =>
  set.steps.filter((s): s is TourStep => !!s.tour);

/** Widget types the tour needs that the board does not have yet. */
export const missingSetupWidgets = (
  set: Pick<GuidedLearningSet, 'tourSetup'>,
  widgets: readonly Pick<WidgetData, 'type'>[]
): WidgetType[] => {
  const present = new Set(widgets.map((w) => w.type));
  return [...new Set(set.tourSetup?.widgets ?? [])].filter(
    (type) => !present.has(type)
  );
};

/** The widget instance the tour added for each type, keyed by type. */
export type TourWidgetClaims = Partial<Record<WidgetType, string>>;

/** Claims the first new widget of each added type once; later same-type widgets are the teacher's. */
export const claimTourWidgets = (
  widgets: readonly Pick<WidgetData, 'id' | 'type'>[],
  beforeIds: ReadonlySet<string>,
  addedTypes: readonly WidgetType[],
  claims: TourWidgetClaims = {}
): TourWidgetClaims => {
  let next = claims;
  for (const type of addedTypes) {
    if (next[type]) continue;
    const w = widgets.find((x) => x.type === type && !beforeIds.has(x.id));
    if (w) next = { ...next, [type]: w.id };
  }
  return next;
};

/** Claimed widget ids still on the board: exactly what teardown may remove. */
export const tourWidgetIds = (
  widgets: readonly Pick<WidgetData, 'id'>[],
  claims: TourWidgetClaims
): string[] => {
  const ids = new Set(Object.values(claims));
  return widgets.filter((w) => ids.has(w.id)).map((w) => w.id);
};

/** Whether a tour step has a recorded slide to show when its anchor is missing. */
export const hasStepSlide = (
  set: Pick<GuidedLearningSet, 'imageUrls'>,
  step: Pick<GuidedLearningStep, 'imageIndex'>
): boolean => !!set.imageUrls[step.imageIndex ?? 0];

/** Whether autopilot must leave this step's click to the teacher. */
export const teacherMustClick = (
  binding: Pick<GuidedLearningTourBinding, 'anchor' | 'teacherMustClick'>
): boolean => binding.teacherMustClick ?? isDestructiveAnchor(binding.anchor);
