import type { GuidedLearningTourBinding } from '@/types';
import { accessibleName, roleOf } from '@/components/tours/resolveTourAnchor';

export interface RecordedAnchor {
  /** Tour anchor ref; empty when untagged, so the runner goes straight to the fallback. */
  anchor: string;
  fallback?: GuidedLearningTourBinding['fallback'];
  untagged: boolean;
  /** For untagged steps: an id Paul can add to the registry and tag in code. */
  suggestedId?: string;
  /** The element whose bounds become the step's region. */
  element: HTMLElement;
}

const INTERACTIVE = '[role], button, a[href], input, select, textarea, label';

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

const fallbackOf = (el: Element): RecordedAnchor['fallback'] => {
  const role = roleOf(el);
  const name = accessibleName(el);
  return role && name ? { role, name } : undefined;
};

/** Resolves what a recorded click landed on; null for the recorder's own UI. */
export function resolveRecordedAnchor(target: Element): RecordedAnchor | null {
  if (target.closest('[data-tour-ignore]')) return null;
  const tagged = target.closest<HTMLElement>('[data-tour]');
  if (tagged) {
    const id = tagged.getAttribute('data-tour') ?? '';
    const type = tagged.getAttribute('data-tour-widget-type');
    return {
      anchor: type ? `${id}:${type}` : id,
      fallback: fallbackOf(tagged),
      untagged: false,
      element: tagged,
    };
  }
  const element =
    target.closest<HTMLElement>(INTERACTIVE) ??
    (target instanceof HTMLElement ? target : null);
  if (!element) return null;
  const fallback = fallbackOf(element);
  return {
    anchor: '',
    fallback,
    untagged: true,
    suggestedId: fallback
      ? `${fallback.role}.${slug(fallback.name)}`
      : undefined,
    element,
  };
}

export interface Size {
  w: number;
  h: number;
}

export interface RecordedPlacement {
  xPct: number;
  yPct: number;
  region: { shape: 'rect'; wPct: number; hPct: number };
}

const REGION_PAD_PX = 4;

const clampPct = (n: number) => Math.min(Math.max(n, 0), 100);
const round = (n: number) => Math.round(n * 100) / 100;

export interface FrameBox {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

/** Maps a padded viewport rect (CSS px) onto the captured frame as a top-left image-% box, allowing for DPR and letterboxing. */
export function rectToFrameBox(
  rect: { x: number; y: number; width: number; height: number },
  viewport: Size,
  frame: Size,
  pad = REGION_PAD_PX
): FrameBox {
  const scale = Math.min(frame.w / viewport.w, frame.h / viewport.h);
  const offsetX = (frame.w - viewport.w * scale) / 2;
  const offsetY = (frame.h - viewport.h * scale) / 2;
  const x0 = clampPct(((offsetX + (rect.x - pad) * scale) / frame.w) * 100);
  const x1 = clampPct(
    ((offsetX + (rect.x + rect.width + pad) * scale) / frame.w) * 100
  );
  const y0 = clampPct(((offsetY + (rect.y - pad) * scale) / frame.h) * 100);
  const y1 = clampPct(
    ((offsetY + (rect.y + rect.height + pad) * scale) / frame.h) * 100
  );
  return { xPct: x0, yPct: y0, wPct: x1 - x0, hPct: y1 - y0 };
}

/** The step placement for a clicked element: its padded box as a centre point and region. */
export function rectToImagePct(
  rect: { x: number; y: number; width: number; height: number },
  viewport: Size,
  frame: Size
): RecordedPlacement {
  const box = rectToFrameBox(rect, viewport, frame);
  return {
    xPct: round(box.xPct + box.wPct / 2),
    yPct: round(box.yPct + box.hPct / 2),
    region: { shape: 'rect', wPct: round(box.wPct), hPct: round(box.hPct) },
  };
}
