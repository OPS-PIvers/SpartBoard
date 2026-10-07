import type {
  GuidedLearningStep,
  GuidedLearningTourBinding,
  WidgetType,
} from '@/types';
import {
  TOUR_ANCHORS,
  WHOLE_BOARD_ANCHOR,
  isTourAnchorId,
  parseTourAnchorRef,
  type TourAnchorDef,
} from '@/config/tourAnchors';
import type { TourSlots } from '@/components/tours/tourSession';
import type { RecordedStep } from '@/components/widgets/GuidedLearning/components/recorder/useTourCapture';
import type { RecordedFrame } from '@/components/widgets/GuidedLearning/components/recorder/buildRecordedSet';
import { newTourStep } from './useTourEditorSession';

interface Options {
  /** Tour slot to widget id on the stage, so a click in a tour widget records its slot. */
  slots: TourSlots;
  /** Board widget types by id, for widget-scoped anchors recorded without one. */
  typeOf: ReadonlyMap<string, WidgetType>;
}

const bindWidget = (
  tour: GuidedLearningTourBinding,
  widgetId: string | undefined,
  { slots, typeOf }: Options
): GuidedLearningTourBinding => {
  const { id, widgetType } = parseTourAnchorRef(tour.anchor);
  if (!widgetId || !isTourAnchorId(id)) return tour;
  const def: TourAnchorDef = TOUR_ANCHORS[id];
  if (!def.perWidget && !def.perWidgetType) return tour;
  const type = widgetType ?? typeOf.get(widgetId);
  const slot = Object.entries(slots).find(([, wid]) => wid === widgetId)?.[0];
  return {
    ...tour,
    ...(type ? { anchor: `${id}:${type}` } : {}),
    ...(slot === undefined ? {} : { slot: Number(slot) }),
  };
};

/** Editor steps from recorded clicks, each with its frame as the thumbnail. */
export function recordedTourSteps(
  steps: readonly RecordedStep[],
  frames: readonly (RecordedFrame | undefined)[],
  opts: Options
): GuidedLearningStep[] {
  return steps.map((s) => {
    const tour = bindWidget(s.tour, s.widgetId, opts);
    const frame = frames[s.frameIndex];
    const pictured =
      !!frame?.url && !!tour.anchor && tour.anchor !== WHOLE_BOARD_ANCHOR;
    return newTourStep({
      label: '',
      tour: pictured
        ? {
            ...tour,
            thumbnail: {
              url: frame.url,
              anchor: tour.anchor,
              w: frame.w,
              h: frame.h,
            },
          }
        : tour,
    });
  });
}
