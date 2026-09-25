import type {
  GuidedLearningTourBinding,
  TourLayoutKeyframe,
  TourWidgetLayout,
  WidgetData,
  WidgetType,
} from '@/types';
import { pixelToProp } from '@/utils/proportionalLayout';
import { pickAppearanceKeys } from '@/utils/widgetConfigPersistence';

/** One widget's place on the board at a moment in the recording. */
export interface RecordedBoardWidget {
  id: string;
  type: WidgetType;
  z: number;
  xProp: number;
  yProp: number;
  wProp: number;
  hProp: number;
  aspectRatio?: number;
  appearance?: Record<string, unknown>;
}

// Four decimals is well under a pixel on any screen and keeps the set small.
const round = (n: number) => Math.round(n * 10000) / 10000;

/** The board's widgets as recorded layouts; appearance keys only, never content. */
export function boardLayoutOf(
  widgets: readonly WidgetData[],
  viewport: { w: number; h: number } = {
    w: window.innerWidth,
    h: window.innerHeight,
  }
): RecordedBoardWidget[] {
  return widgets
    .filter((w) => !w.transient)
    .map((w) => {
      const props =
        w.xProp !== undefined &&
        w.yProp !== undefined &&
        w.wProp !== undefined &&
        w.hProp !== undefined
          ? { xProp: w.xProp, yProp: w.yProp, wProp: w.wProp, hProp: w.hProp }
          : pixelToProp(
              { x: w.x, y: w.y, w: w.w, h: w.h },
              viewport.w,
              viewport.h
            );
      // Older boards can hold a widget with no config at all.
      const config = w.config as WidgetData['config'] | undefined;
      const appearance = pickAppearanceKeys(config ?? {});
      return {
        id: w.id,
        type: w.type,
        z: w.z,
        xProp: round(props.xProp),
        yProp: round(props.yProp),
        wProp: round(props.wProp),
        hProp: round(props.hProp),
        ...(typeof w.aspectRatio === 'number'
          ? { aspectRatio: round(w.aspectRatio) }
          : {}),
        ...(Object.keys(appearance).length > 0
          ? { appearance: appearance as Record<string, unknown> }
          : {}),
      };
    });
}

const layoutOf = (w: RecordedBoardWidget, slot: number): TourWidgetLayout => ({
  slot,
  type: w.type,
  xProp: w.xProp,
  yProp: w.yProp,
  wProp: w.wProp,
  hProp: w.hProp,
  ...(w.aspectRatio === undefined ? {} : { aspectRatio: w.aspectRatio }),
  ...(w.appearance ? { appearance: w.appearance } : {}),
});

const samePlace = (a: RecordedBoardWidget, b: RecordedBoardWidget) =>
  a.xProp === b.xProp &&
  a.yProp === b.yProp &&
  a.wProp === b.wProp &&
  a.hProp === b.hProp;

const byZ = (list: readonly RecordedBoardWidget[]) =>
  [...list].sort((a, b) => a.z - b.z);

export type RecordedStepLayout = Pick<
  GuidedLearningTourBinding,
  'spawns' | 'layoutKeyframes'
>;

export interface RecordedLayouts {
  /** Setup slots: the board at record start, in z-order. */
  layouts: TourWidgetLayout[];
  /** Spawns and keyframes, one entry per step. */
  steps: RecordedStepLayout[];
  /** Widget id to its slot, for binding widget-scoped anchors. */
  slotOf: ReadonlyMap<string, number>;
}

/** Slots, spawns and keyframes from the board at record start and at each step's capture. */
export function buildRecordedLayouts(
  start: readonly RecordedBoardWidget[],
  stepBoards: readonly (readonly RecordedBoardWidget[] | undefined)[],
  end?: readonly RecordedBoardWidget[]
): RecordedLayouts {
  const slotOf = new Map<string, number>();
  const last = new Map<string, RecordedBoardWidget>();
  const layouts: TourWidgetLayout[] = [];
  for (const w of byZ(start)) {
    slotOf.set(w.id, layouts.length);
    layouts.push(layoutOf(w, layouts.length));
    last.set(w.id, w);
  }
  let nextSlot = layouts.length;
  const steps: RecordedStepLayout[] = stepBoards.map(() => ({}));
  const boards = [...stepBoards, end];
  boards.forEach((board, k) => {
    if (!board) return;
    const keyframes: TourLayoutKeyframe[] = [];
    for (const w of byZ(board)) {
      const slot = slotOf.get(w.id);
      if (slot === undefined) {
        const fresh = nextSlot++;
        slotOf.set(w.id, fresh);
        last.set(w.id, w);
        // Opened before the first click: part of the setup board.
        if (k === 0) layouts.push(layoutOf(w, fresh));
        else if (!steps[k - 1].spawns) steps[k - 1].spawns = layoutOf(w, fresh);
        continue;
      }
      const prev = last.get(w.id);
      last.set(w.id, w);
      if (k < stepBoards.length && prev && !samePlace(prev, w)) {
        keyframes.push({
          slot,
          xProp: w.xProp,
          yProp: w.yProp,
          wProp: w.wProp,
          hProp: w.hProp,
        });
      }
    }
    if (keyframes.length > 0) steps[k].layoutKeyframes = keyframes;
  });
  return { layouts, steps, slotOf };
}
