import type {
  GuidedLearningSet,
  TourMaterial,
  TourOpenMaterial,
  TourStepStart,
  TourWidgetLayout,
  WidgetData,
} from '@/types';
import type { TourLayoutOverride } from '@/context/dashboardCanvasStore';
import type { TourSlots } from '@/components/tours/tourSession';
import {
  computeWidgetPixelRect,
  pixelToProp,
} from '@/utils/proportionalLayout';
import { WIDGET_STRETCH_BEHAVIOR } from '@/config/widgetDefaults';
import { pickAppearanceKeys } from '@/utils/widgetConfigPersistence';
import { getOpenTourMaterials } from '@/components/tours/tourMaterials';
import { materialForOpenItem } from '@/components/tours/tourMaterialSeed';

const round = (n: number) => Math.round(n * 10000) / 10000;

/** The highest slot any part of the tour uses, so new widgets get fresh ones. */
export const maxTourSlot = (
  set: GuidedLearningSet,
  slots: TourSlots
): number => {
  const used = [
    ...Object.keys(slots).map(Number),
    ...(set.tourSetup?.layouts ?? []).map((l) => l.slot),
    ...set.steps.flatMap((s) => [
      ...(s.tour?.slot === undefined ? [] : [s.tour.slot]),
      ...(s.tour?.spawns ? [s.tour.spawns.slot] : []),
      ...(s.tour?.layoutKeyframes ?? []).map((k) => k.slot),
      ...(s.tour?.start?.layouts ?? []).map((l) => l.slot),
    ]),
  ];
  return used.length > 0 ? Math.max(...used) : -1;
};

const propsOf = (w: WidgetData, viewport: { w: number; h: number }) =>
  w.xProp !== undefined &&
  w.yProp !== undefined &&
  w.wProp !== undefined &&
  w.hProp !== undefined
    ? { xProp: w.xProp, yProp: w.yProp, wProp: w.wProp, hProp: w.hProp }
    : pixelToProp({ x: w.x, y: w.y, w: w.w, h: w.h }, viewport.w, viewport.h);

export interface CapturedStart {
  start: TourStepStart;
  /** Slot to widget id for every captured widget, so the runner can follow new ones. */
  slots: Record<number, string>;
  /** A made-in-the-tour material the open editor needed. */
  addedMaterial?: TourMaterial;
}

/** The board as the admin sees it now, as a step's starting board. */
export function captureStepStart(args: {
  widgets: readonly WidgetData[];
  hidden: ReadonlySet<string>;
  overrides: ReadonlyMap<string, TourLayoutOverride>;
  slots: TourSlots;
  set: GuidedLearningSet;
  untitledLabel: string;
  viewport?: { w: number; h: number };
}): CapturedStart {
  const viewport = args.viewport ?? {
    w: window.innerWidth,
    h: window.innerHeight,
  };
  const slotOf = new Map(
    Object.entries(args.slots).map(([slot, id]) => [id, Number(slot)])
  );
  let next = maxTourSlot(args.set, args.slots) + 1;
  const layouts: TourWidgetLayout[] = [];
  const slots: Record<number, string> = {};
  const visible = args.widgets
    .filter((w) => !args.hidden.has(w.id) && !w.minimized)
    .sort((a, b) => a.z - b.z);
  for (const w of visible) {
    const slot = slotOf.get(w.id) ?? next++;
    const place = { ...propsOf(w, viewport), ...args.overrides.get(w.id) };
    const appearance = pickAppearanceKeys(w.config ?? {});
    slots[slot] = w.id;
    layouts.push({
      slot,
      type: w.type,
      xProp: round(place.xProp),
      yProp: round(place.yProp),
      wProp: round(place.wProp),
      hProp: round(place.hProp),
      ...(typeof w.aspectRatio === 'number'
        ? { aspectRatio: round(w.aspectRatio) }
        : {}),
      ...(Object.keys(appearance).length > 0
        ? { appearance: appearance as Record<string, unknown> }
        : {}),
    });
  }
  const materials = args.set.tourSetup?.materials ?? [];
  let open: TourOpenMaterial | undefined;
  let addedMaterial: TourMaterial | undefined;
  for (const [widgetId, item] of getOpenTourMaterials()) {
    const slot =
      slotOf.get(widgetId) ??
      layouts.find((l) => slots[l.slot] === widgetId)?.slot;
    if (slot === undefined) continue;
    const found = materialForOpenItem(
      item.kind,
      item.itemId,
      materials,
      args.untitledLabel
    );
    if (found.added) addedMaterial = found.material;
    open = {
      materialId: found.material.id,
      slot,
      ...(found.material.source === 'created' && found.content
        ? { content: found.content }
        : {}),
    };
    break;
  }
  return {
    start: { layouts, ...(open ? { open } : {}) },
    slots,
    addedMaterial,
  };
}

/** Writes the tour's temporary places onto its own unsaved widgets, so a paused admin can drag them. */
export function bakeTourOverrides(
  widgets: readonly WidgetData[],
  overrides: ReadonlyMap<string, TourLayoutOverride>,
  updateWidget: (id: string, patch: Partial<WidgetData>) => void
): void {
  for (const w of widgets) {
    const layout = overrides.get(w.id);
    if (!w.transient || !layout) continue;
    const rect = computeWidgetPixelRect(
      { ...layout, aspectRatio: layout.aspectRatio ?? w.aspectRatio },
      window.innerWidth,
      window.innerHeight,
      WIDGET_STRETCH_BEHAVIOR[w.type] ?? 'preserve-aspect'
    );
    updateWidget(w.id, { ...layout, ...rect });
  }
}
