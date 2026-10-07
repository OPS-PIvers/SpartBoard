import type { GuidedLearningTourBinding } from '@/types';
import {
  TOUR_ANCHORS,
  WHOLE_BOARD_ANCHOR,
  isTourAnchorId,
  type TourAnchorDef,
  type TourAnchorId,
} from '@/config/tourAnchors';
import { accessibleName, roleOf } from '@/components/tours/resolveTourAnchor';
import type { TourSlots } from '@/components/tours/tourSession';

/** What Pick control or the anchor list chose for a step. */
export interface TourAnchorPick {
  anchor: string;
  slot?: number;
  fallback?: GuidedLearningTourBinding['fallback'];
}

export interface PickTarget {
  pick: TourAnchorPick;
  element: HTMLElement;
  label: string;
}

const defOf = (id: TourAnchorId): TourAnchorDef => TOUR_ANCHORS[id];

const isWidgetScoped = (def: TourAnchorDef) =>
  !!(def.perWidget ?? def.perWidgetType ?? def.perField);

/** The nearest registered anchor at or above `target`; unregistered tags and the picker's own UI are skipped. */
export function resolvePickTarget(
  target: Element | null,
  slots: TourSlots = {}
): PickTarget | null {
  if (!target || target.closest('[data-tour-ignore]')) return null;
  for (
    let el = target.closest<HTMLElement>('[data-tour]');
    el;
    el = el.parentElement?.closest<HTMLElement>('[data-tour]') ?? null
  ) {
    const id = el.getAttribute('data-tour') ?? '';
    // The whole board wraps everything; it is chosen from the list instead.
    if (id === WHOLE_BOARD_ANCHOR || !isTourAnchorId(id)) continue;
    const def = defOf(id);
    const type = el.getAttribute('data-tour-widget-type');
    const field = el.getAttribute('data-tour-field');
    const anchor = type ? `${id}:${type}${field ? `#${field}` : ''}` : id;
    const widgetId = isWidgetScoped(def)
      ? el.closest('[data-tour-widget]')?.getAttribute('data-tour-widget')
      : undefined;
    const slotEntry = widgetId
      ? Object.entries(slots).find(([, wid]) => wid === widgetId)
      : undefined;
    const role = roleOf(el);
    const name = accessibleName(el);
    return {
      pick: {
        anchor,
        ...(slotEntry ? { slot: Number(slotEntry[0]) } : {}),
        ...(role && name ? { fallback: { role, name } } : {}),
      },
      element: el,
      label: def.label,
    };
  }
  return null;
}

/** A step binding with a new anchor: the action and value stay, the old slot, fallback and unmapped marker go. */
export function applyAnchorPick(
  binding: GuidedLearningTourBinding | undefined,
  pick: TourAnchorPick
): GuidedLearningTourBinding {
  const next: GuidedLearningTourBinding = {
    ...(binding ?? { action: 'click' }),
    anchor: pick.anchor,
  };
  delete next.slot;
  delete next.fallback;
  delete next.unmapped;
  if (pick.slot !== undefined) next.slot = pick.slot;
  if (pick.fallback) next.fallback = pick.fallback;
  if (pick.anchor === WHOLE_BOARD_ANCHOR) {
    next.action = 'observe';
    delete next.value;
  }
  return next;
}
