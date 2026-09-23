import type {
  GuidedLearningSet,
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

/** Widgets that appeared after setup started and are of a type the tour added. */
export const addedWidgetIds = (
  widgets: readonly Pick<WidgetData, 'id' | 'type'>[],
  beforeIds: ReadonlySet<string>,
  addedTypes: readonly WidgetType[]
): string[] =>
  widgets
    .filter((w) => !beforeIds.has(w.id) && addedTypes.includes(w.type))
    .map((w) => w.id);
