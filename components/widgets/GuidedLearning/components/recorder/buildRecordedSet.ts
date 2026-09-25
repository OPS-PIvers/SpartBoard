import type {
  GuidedLearningSet,
  GuidedLearningTourBinding,
  WidgetData,
  WidgetType,
} from '@/types';
import {
  TOUR_ANCHORS,
  isTourAnchorId,
  parseTourAnchorRef,
  type TourAnchorDef,
} from '@/config/tourAnchors';
import {
  anchorFingerprint,
  type UnmappedQueueEntry,
} from '@/components/tours/anchorQueue';
import type { RecordedStep, TourRecording } from './useTourCapture';
import {
  buildRecordedLayouts,
  type RecordedBoardWidget,
  type RecordedStepLayout,
} from './recordedLayouts';

type BoardWidget = Pick<WidgetData, 'id' | 'type'>;

/** Widget type a dock or library tile click adds, if the step is one. */
const addedTypeOf = (anchor: string): WidgetType | undefined => {
  const { id, widgetType } = parseTourAnchorRef(anchor);
  if (!widgetType || !isTourAnchorId(id)) return undefined;
  const def: TourAnchorDef = TOUR_ANCHORS[id];
  return def.perWidgetType ? (widgetType as WidgetType) : undefined;
};

/** Widget types the recorded steps clicked inside, minus ones an earlier step added itself. */
export function touchedWidgetTypes(
  steps: readonly Pick<RecordedStep, 'tour' | 'widgetId'>[],
  widgets: readonly BoardWidget[],
  startIds: ReadonlySet<string>
): WidgetType[] {
  const typeOf = new Map(widgets.map((w) => [w.id, w.type]));
  const added = new Set<WidgetType>();
  const touched = new Set<WidgetType>();
  for (const step of steps) {
    const adds = addedTypeOf(step.tour.anchor);
    if (adds) added.add(adds);
    const type = step.widgetId ? typeOf.get(step.widgetId) : undefined;
    if (!type || !step.widgetId) continue;
    if (!startIds.has(step.widgetId) && added.has(type)) continue;
    touched.add(type);
  }
  return [...touched];
}

interface BuildOptions {
  id: string;
  title: string;
  /** Uploaded slide URLs, one per recorded frame, in order. */
  imageUrls: string[];
  imagePaths?: string[];
  slideThumbnails?: Record<string, string>;
  /** Every widget seen on the board during the recording. */
  widgets: readonly BoardWidget[];
  /** Ids of the widgets on the board when recording started. */
  startIds: ReadonlySet<string>;
  /** Widget layouts at record start; absent = no recorded layout. */
  startBoard?: readonly RecordedBoardWidget[];
  /** Widget layouts when recording finished, to catch a widget the last step opened. */
  endBoard?: readonly RecordedBoardWidget[];
  now?: number;
}

/** A widget-scoped anchor names its widget's type and slot, so the runner picks the right one of several. */
const bindWidget = (
  tour: GuidedLearningTourBinding,
  widgetId: string | undefined,
  typeOf: ReadonlyMap<string, WidgetType>,
  slotOf: ReadonlyMap<string, number>,
  layout: RecordedStepLayout
): GuidedLearningTourBinding => {
  const next: GuidedLearningTourBinding = { ...tour, ...layout };
  const { id, widgetType } = parseTourAnchorRef(tour.anchor);
  if (!widgetId || !isTourAnchorId(id)) return next;
  const def: TourAnchorDef = TOUR_ANCHORS[id];
  if (!def.perWidget && !def.perWidgetType) return next;
  const type = widgetType ?? typeOf.get(widgetId);
  const slot = slotOf.get(widgetId);
  return {
    ...next,
    ...(type ? { anchor: `${id}:${type}` } : {}),
    ...(slot === undefined ? {} : { slot }),
  };
};

const withUnmapped = (
  tour: GuidedLearningTourBinding,
  fingerprint: string | undefined
): GuidedLearningTourBinding =>
  fingerprint ? { ...tour, unmapped: fingerprint } : tour;

/** Queue entries for the untagged steps, grouped by fingerprint, keyed by step id. */
async function unmappedEntries(
  steps: readonly RecordedStep[],
  setId: string,
  widgets: readonly BoardWidget[]
): Promise<{ byStep: Map<string, string>; queue: UnmappedQueueEntry[] }> {
  const typeOf = new Map(widgets.map((w) => [w.id, w.type]));
  const byStep = new Map<string, string>();
  const queue = new Map<string, UnmappedQueueEntry>();
  for (const step of steps) {
    if (!step.untagged || !step.context) continue;
    const context = {
      ...step.context,
      widgetType:
        step.context.widgetType ??
        (step.widgetId ? typeOf.get(step.widgetId) : undefined) ??
        null,
    };
    const fingerprint = await anchorFingerprint(context);
    byStep.set(step.id, fingerprint);
    const occurrence = { setId, stepId: step.id };
    const entry = queue.get(fingerprint);
    if (entry) entry.occurrences.push(occurrence);
    else
      queue.set(fingerprint, {
        fingerprint,
        context,
        occurrences: [occurrence],
      });
  }
  return { byStep, queue: [...queue.values()] };
}

/** A v3 building set from a recording (one slide per frame, one tooltip step per click), plus its unmapped-anchor queue entries. */
export async function buildRecordedSet(
  recording: Pick<TourRecording, 'steps'>,
  opts: BuildOptions
): Promise<{ set: GuidedLearningSet; queue: UnmappedQueueEntry[] }> {
  const now = opts.now ?? Date.now();
  const recorded = opts.startBoard
    ? buildRecordedLayouts(
        opts.startBoard,
        recording.steps.map((s) => s.board),
        opts.endBoard
      )
    : null;
  const typeOf = new Map<string, WidgetType>([
    ...opts.widgets.map((w) => [w.id, w.type] as const),
    ...(opts.startBoard ?? []).map((w) => [w.id, w.type] as const),
    ...recording.steps.flatMap((s) =>
      (s.board ?? []).map((w) => [w.id, w.type] as const)
    ),
  ]);
  const setupWidgets = touchedWidgetTypes(
    recording.steps,
    opts.widgets,
    opts.startIds
  );
  const { byStep, queue } = await unmappedEntries(
    recording.steps,
    opts.id,
    opts.widgets
  );
  const set: GuidedLearningSet = {
    id: opts.id,
    schemaVersion: 3,
    title: opts.title,
    imageUrls: opts.imageUrls,
    ...(opts.imagePaths?.length ? { imagePaths: opts.imagePaths } : {}),
    ...(opts.slideThumbnails && Object.keys(opts.slideThumbnails).length > 0
      ? { slideThumbnails: opts.slideThumbnails }
      : {}),
    steps: recording.steps.map((s, i) => ({
      id: s.id,
      xPct: s.xPct,
      yPct: s.yPct,
      imageIndex: s.frameIndex,
      label: '',
      interactionType: 'tooltip',
      showOverlay: 'tooltip',
      region: s.region,
      tour: withUnmapped(
        recorded
          ? bindWidget(
              s.tour,
              s.widgetId,
              typeOf,
              recorded.slotOf,
              recorded.steps[i]
            )
          : s.tour,
        byStep.get(s.id)
      ),
    })),
    mode: 'structured',
    createdAt: now,
    updatedAt: now,
    isBuilding: true,
    tourSetup: {
      widgets: setupWidgets,
      ...(recorded && recorded.layouts.length > 0
        ? { layouts: recorded.layouts }
        : {}),
    },
    hasLiveTour: recording.steps.length > 0,
  };
  return { set, queue };
}

/** Untagged recorded steps, for the "tag these in code" list. */
export const untaggedSteps = (recording: Pick<TourRecording, 'steps'>) =>
  recording.steps.filter((s) => s.untagged);
