import type { RosterPerson } from '@/components/widgets/GuidedLearning/components/recorder/redaction';
import {
  buildNameMatcher,
  collectRedactionRects,
  toFrameRedactions,
  type ViewportRect,
} from '@/components/widgets/GuidedLearning/components/recorder/redaction';
import {
  rectToImagePct,
  type RecordedPlacement,
} from '@/components/widgets/GuidedLearning/components/recorder/resolveAnchor';
import {
  redactImage,
  type RedactRect,
} from '@/components/widgets/GuidedLearning/utils/redactImage';

interface Size {
  w: number;
  h: number;
}

/** Room around the control, and the smallest picture, so a step's slide shows where it sits. */
export const SNAPSHOT_PAD_PX = 24;
export const SNAPSHOT_MIN: Size = { w: 640, h: 360 };

export interface StepSnapshot {
  /** Already blurred; the raw capture never leaves `captureStepSnapshot`. */
  frame: Blob;
  boxes: RedactRect[];
  placement: RecordedPlacement;
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(Math.max(n, lo), Math.max(lo, hi));

/** The viewport area a step's picture covers: the control, padded and grown to the minimum, kept on screen. */
export function snapshotCrop(rect: ViewportRect, viewport: Size): ViewportRect {
  const width = Math.min(
    viewport.w,
    Math.max(rect.width + SNAPSHOT_PAD_PX * 2, SNAPSHOT_MIN.w)
  );
  const height = Math.min(
    viewport.h,
    Math.max(rect.height + SNAPSHOT_PAD_PX * 2, SNAPSHOT_MIN.h)
  );
  const x = clamp(rect.x + rect.width / 2 - width / 2, 0, viewport.w - width);
  const y = clamp(
    rect.y + rect.height / 2 - height / 2,
    0,
    viewport.h - height
  );
  return { x, y, width, height };
}

const shift = (r: ViewportRect, by: ViewportRect): ViewportRect => ({
  x: r.x - by.x,
  y: r.y - by.y,
  width: r.width,
  height: r.height,
});

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error('No image.'))),
      'image/png'
    )
  );

/** Pictures the board around `el` without the tour's own UI, blurring student names and `data-pii`. */
export async function captureStepSnapshot(
  el: Element,
  people: readonly RosterPerson[]
): Promise<StepSnapshot | null> {
  const viewport = { w: window.innerWidth, h: window.innerHeight };
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const crop = snapshotCrop(rect, viewport);
  const size = { w: crop.width, h: crop.height };
  const names = collectRedactionRects(
    document.body,
    buildNameMatcher(people),
    viewport
  );
  const { toCanvas } = await import('html-to-image');
  const full = await toCanvas(document.body, {
    width: viewport.w,
    height: viewport.h,
    pixelRatio: 1,
    filter: (node) =>
      !(node instanceof Element && node.hasAttribute('data-tour-ignore')),
  });
  const out = document.createElement('canvas');
  out.width = Math.round(crop.width);
  out.height = Math.round(crop.height);
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(
    full,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );
  const boxes = toFrameRedactions(
    names.map((r) => shift(r, crop)),
    size,
    size
  );
  const frame = await redactImage(await toBlob(out), boxes, { mode: 'blur' });
  return {
    frame,
    boxes,
    placement: rectToImagePct(shift(rect, crop), size, size),
  };
}
