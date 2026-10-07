import {
  freshTourThumbnail,
  isLiveTourSet,
} from '@/components/widgets/GuidedLearning/utils/liveTour';
import {
  isDestructiveAnchor,
  isPersistsAnchor,
  isTourAnchorId,
  parseTourAnchorRef,
  WHOLE_BOARD_ANCHOR,
} from '@/config/tourAnchors';
import type { TourLayoutOverride } from '@/context/dashboardCanvasStore';
import type {
  FeaturePermission,
  GuidedLearningSet,
  GuidedLearningTourBinding,
  GuidedLearningStep,
  TourAutopilotPolicy,
  TourWidgetLayout,
  WidgetData,
  WidgetType,
} from '@/types';

export type TourStep = GuidedLearningStep & {
  tour: NonNullable<GuidedLearningStep['tour']>;
};

/** A set's live-tour steps, in authored order. */
export const tourStepsOf = (set: GuidedLearningSet): TourStep[] =>
  set.steps.filter((s): s is TourStep => !!s.tour);

// A whole-board step plays as a centred card on the board, like a plain step.
const runStep = (s: GuidedLearningStep): GuidedLearningStep =>
  s.tour?.anchor === WHOLE_BOARD_ANCHOR ? { ...s, tour: undefined } : s;

/** Every step a live tour plays, anchored or plain; none for a set that is not a live tour. */
export const liveTourStepsOf = (
  set: Pick<GuidedLearningSet, 'mode' | 'steps'>
): GuidedLearningStep[] => (isLiveTourSet(set) ? set.steps.map(runStep) : []);

/** The set's welcome message when it is switched on and not blank. */
export const tourWelcome = (
  set: Pick<GuidedLearningSet, 'welcomeEnabled' | 'welcomeMessage'>
): string | null => {
  const message = set.welcomeMessage?.trim();
  return set.welcomeEnabled && message ? message : null;
};

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

/** Tour slot to the widget bound to it on this board. */
export type TourSlots = Readonly<Record<number, string>>;

export interface TourSetupPlan {
  /** The teacher's widgets the tour moves to a slot's layout. */
  bind: { layout: TourWidgetLayout; widgetId: string }[];
  /** Slots with no widget of their type on the board yet. */
  add: TourWidgetLayout[];
  /** Setup types with no recorded layout and none on the board. */
  addTypes: WidgetType[];
}

/** Slots the steps' widget-scoped anchors point at. */
const slotsUsedBy = (steps: readonly GuidedLearningStep[]) =>
  new Set(
    steps.flatMap((s) => (s.tour?.slot === undefined ? [] : [s.tour.slot]))
  );

/** Which recorded slots a tour fills, and how: the first unbound widget of the type wins, in z-order. */
export function planTourSetup(
  set: Pick<GuidedLearningSet, 'tourSetup'>,
  steps: readonly GuidedLearningStep[],
  widgets: readonly Pick<WidgetData, 'id' | 'type' | 'z'>[]
): TourSetupPlan {
  const layouts = set.tourSetup?.layouts ?? [];
  const setupTypes = new Set(set.tourSetup?.widgets ?? []);
  const used = slotsUsedBy(steps);
  const needed = layouts
    .filter((l) => setupTypes.has(l.type) || used.has(l.slot))
    .sort((a, b) => a.slot - b.slot);
  const byZ = [...widgets].sort((a, b) => a.z - b.z);
  const taken = new Set<string>();
  const plan: TourSetupPlan = { bind: [], add: [], addTypes: [] };
  for (const layout of needed) {
    const w = byZ.find((x) => x.type === layout.type && !taken.has(x.id));
    if (w) {
      taken.add(w.id);
      plan.bind.push({ layout, widgetId: w.id });
    } else plan.add.push(layout);
  }
  const laidOut = new Set(layouts.map((l) => l.type));
  const present = new Set(widgets.map((w) => w.type));
  plan.addTypes = [...setupTypes].filter(
    (t) => !laidOut.has(t) && !present.has(t)
  );
  return plan;
}

const overrideOf = (
  l: Pick<TourWidgetLayout, 'xProp' | 'yProp' | 'wProp' | 'hProp'> & {
    aspectRatio?: number;
  }
): TourLayoutOverride => ({
  xProp: l.xProp,
  yProp: l.yProp,
  wProp: l.wProp,
  hProp: l.hProp,
  ...(l.aspectRatio === undefined ? {} : { aspectRatio: l.aspectRatio }),
});

/** Temporary layouts at a step: moved teacher widgets, then every keyframe up to that step. */
export function tourLayoutOverridesAt(
  steps: readonly GuidedLearningStep[],
  index: number,
  slots: TourSlots,
  moved: Readonly<Record<number, TourWidgetLayout>>
): Map<string, TourLayoutOverride> {
  const out = new Map<string, TourLayoutOverride>();
  for (const layout of Object.values(moved)) {
    const id = slots[layout.slot];
    if (id) out.set(id, overrideOf(layout));
  }
  for (let i = 0; i <= index && i < steps.length; i++) {
    for (const kf of steps[i].tour?.layoutKeyframes ?? []) {
      const id = slots[kf.slot];
      if (!id) continue;
      out.set(id, overrideOf({ ...out.get(id), ...kf }));
    }
  }
  return out;
}

/** A spawning step's widget, waiting for the app to open it. */
export interface SpawnWatch {
  layout: TourWidgetLayout;
  /** Board widget ids when the step started. */
  seen: readonly string[];
}

/** Binds each watched spawn to the first new, unbound widget of its type. */
export function claimSpawns(
  widgets: readonly Pick<WidgetData, 'id' | 'type'>[],
  watches: readonly SpawnWatch[],
  slots: TourSlots
): { slots: TourSlots; bound: TourWidgetLayout[]; watches: SpawnWatch[] } {
  if (watches.length === 0) return { slots, bound: [], watches: [] };
  const next: Record<number, string> = { ...slots };
  const boundIds = new Set(Object.values(slots));
  const bound: TourWidgetLayout[] = [];
  const waiting: SpawnWatch[] = [];
  for (const watch of watches) {
    const w = widgets.find(
      (x) =>
        x.type === watch.layout.type &&
        !watch.seen.includes(x.id) &&
        !boundIds.has(x.id)
    );
    if (w) {
      boundIds.add(w.id);
      next[watch.layout.slot] = w.id;
      bound.push(watch.layout);
    } else waiting.push(watch);
  }
  return { slots: next, bound, watches: waiting };
}

/** Whether a tour step has a picture of its current control to show when the anchor is missing. */
export const hasStepSlide = (step: Pick<GuidedLearningStep, 'tour'>): boolean =>
  !!freshTourThumbnail(step);

/** Every kind but `observe` is something the teacher does to the anchor. */
export const isActedStep = (
  binding: Pick<GuidedLearningTourBinding, 'action'> | undefined
): boolean => !!binding && binding.action !== 'observe';

export const DEFAULT_TOUR_AUTOPILOT_POLICY: TourAutopilotPolicy = 'tour-safe';

const AUTOPILOT_POLICIES: readonly TourAutopilotPolicy[] = [
  'tour-safe',
  'destructive-only',
  'confirm',
];

/** The admin's Autopilot policy from the Guided Learning permission; anything unrecognised is `tour-safe`. */
export const resolveTourAutopilotPolicy = (
  permissions: readonly Pick<FeaturePermission, 'widgetType' | 'config'>[] = []
): TourAutopilotPolicy => {
  const value = permissions.find((p) => p.widgetType === 'guided-learning')
    ?.config?.tourAutopilotPolicy;
  return AUTOPILOT_POLICIES.find((p) => p === value) ?? 'tour-safe';
};

/** What Autopilot does on a step under the policy: click it, ask the teacher first, or leave it to them. */
export const autopilotGate = (
  binding: Pick<GuidedLearningTourBinding, 'anchor' | 'teacherMustClick'>,
  policy: TourAutopilotPolicy
): 'perform' | 'confirm' | 'teacher' => {
  const fallbackOnly = !isTourAnchorId(parseTourAnchorRef(binding.anchor).id);
  const risky =
    isDestructiveAnchor(binding.anchor) || isPersistsAnchor(binding.anchor);
  if (policy === 'tour-safe')
    return fallbackOnly || risky || binding.teacherMustClick === true
      ? 'teacher'
      : 'perform';
  if (policy === 'destructive-only') {
    const leave =
      binding.teacherMustClick ??
      (fallbackOnly || isDestructiveAnchor(binding.anchor));
    return leave ? 'teacher' : 'perform';
  }
  if (fallbackOnly || binding.teacherMustClick === true) return 'teacher';
  return risky ? 'confirm' : 'perform';
};

/** Whether autopilot must leave this step's click to the teacher. */
export const teacherMustClick = (
  binding: Pick<GuidedLearningTourBinding, 'anchor' | 'teacherMustClick'>,
  policy: TourAutopilotPolicy
): boolean => autopilotGate(binding, policy) === 'teacher';
