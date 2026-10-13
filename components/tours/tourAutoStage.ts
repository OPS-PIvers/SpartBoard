// Auto-stage (LIVE_TOUR_ONE_SHOT.md D10): a tour with no recorded layouts gets one, with the step's own widget large.
import { parseTourAnchorRef } from '@/config/tourAnchors';
import type {
  GuidedLearningSet,
  GuidedLearningStep,
  TourLayoutKeyframe,
  TourWidgetLayout,
  WidgetType,
} from '@/types';

type Box = Pick<TourWidgetLayout, 'xProp' | 'yProp' | 'wProp' | 'hProp'>;

// Board fractions clear of the top bar and the Dock.
const TOP = 0.1;
const BOTTOM = 0.84;
const GAP = 0.02;

/** Where each widget sits when `focus` is the one the step is about: it large, the rest in a column beside it. */
export function stageBoxes(count: number, focus: number): Box[] {
  const height = BOTTOM - TOP;
  if (count <= 1)
    return [{ xProp: 0.22, yProp: TOP, wProp: 0.56, hProp: height }];
  const others = count - 1;
  const sideH = (height - GAP * (others - 1)) / others;
  let row = 0;
  return Array.from({ length: count }, (_, i) => {
    if (i === focus)
      return { xProp: 0.04, yProp: TOP, wProp: 0.6, hProp: height };
    const box = {
      xProp: 0.67,
      yProp: TOP + row * (sideH + GAP),
      wProp: 0.29,
      hProp: sideH,
    };
    row += 1;
    return box;
  });
}

/** Each staged type's slot: the slot its steps already use, else the next free one. */
export function stageSlots(
  types: readonly WidgetType[],
  steps: readonly GuidedLearningStep[]
): number[] {
  const used = new Map<string, number>();
  for (const step of steps) {
    const binding = step.tour;
    const type = binding && parseTourAnchorRef(binding.anchor).widgetType;
    if (binding?.slot !== undefined && type && !used.has(type))
      used.set(type, binding.slot);
  }
  const taken = new Set([
    ...used.values(),
    ...steps.flatMap((s) => (s.tour?.spawns ? [s.tour.spawns.slot] : [])),
  ]);
  let next = 0;
  return types.map((type) => {
    const slot = used.get(type);
    if (slot !== undefined) return slot;
    while (taken.has(next)) next += 1;
    taken.add(next);
    return next;
  });
}

/** Whether the runner should stage this tour itself. */
export const needsAutoStage = (set: GuidedLearningSet): boolean =>
  !set.tourSetup?.useTeacherBoard &&
  !set.tourSetup?.layouts?.length &&
  (set.tourSetup?.widgets.length ?? 0) > 0;

/** The tour with layouts for its widgets and a keyframe wherever the step's widget changes. */
export function autoStage(
  set: GuidedLearningSet,
  steps: readonly GuidedLearningStep[]
): { set: GuidedLearningSet; steps: GuidedLearningStep[] } {
  const types = [...new Set(set.tourSetup?.widgets ?? [])];
  const slots = stageSlots(types, steps);
  const indexOf = new Map(types.map((t, i) => [t as string, i]));
  const focusOf = (step: GuidedLearningStep): number | undefined => {
    const binding = step.tour;
    if (!binding) return undefined;
    const type = parseTourAnchorRef(binding.anchor).widgetType;
    if (type && indexOf.has(type)) return indexOf.get(type);
    const bySlot =
      binding.slot === undefined ? -1 : slots.indexOf(binding.slot);
    return bySlot >= 0 ? bySlot : undefined;
  };
  const place = (focus: number) =>
    stageBoxes(types.length, focus).map((box, i) => ({
      slot: slots[i],
      ...box,
    }));

  const first = steps.map(focusOf).find((f) => f !== undefined) ?? 0;
  let current = first;
  const staged = steps.map((step, i) => {
    const focus = focusOf(step);
    if (i === 0 || focus === undefined || focus === current || !step.tour)
      return step;
    current = focus;
    const keyframes: TourLayoutKeyframe[] = place(focus);
    return {
      ...step,
      tour: {
        ...step.tour,
        layoutKeyframes: [...(step.tour.layoutKeyframes ?? []), ...keyframes],
      },
    };
  });
  const layouts: TourWidgetLayout[] = place(first).map((box, i) => ({
    ...box,
    type: types[i],
  }));
  return {
    set: { ...set, tourSetup: { ...set.tourSetup, widgets: types, layouts } },
    steps: staged,
  };
}
