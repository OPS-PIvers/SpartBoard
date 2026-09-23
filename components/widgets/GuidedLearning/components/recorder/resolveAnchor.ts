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

/** Maps a viewport rect (CSS px) onto the captured frame as image-%, allowing for DPR and letterboxing. */
export function rectToImagePct(
  rect: { x: number; y: number; width: number; height: number },
  viewport: Size,
  frame: Size
): RecordedPlacement {
  const scale = Math.min(frame.w / viewport.w, frame.h / viewport.h);
  const offsetX = (frame.w - viewport.w * scale) / 2;
  const offsetY = (frame.h - viewport.h * scale) / 2;
  const left = offsetX + (rect.x - REGION_PAD_PX) * scale;
  const top = offsetY + (rect.y - REGION_PAD_PX) * scale;
  const right = offsetX + (rect.x + rect.width + REGION_PAD_PX) * scale;
  const bottom = offsetY + (rect.y + rect.height + REGION_PAD_PX) * scale;
  const x0 = clampPct((left / frame.w) * 100);
  const x1 = clampPct((right / frame.w) * 100);
  const y0 = clampPct((top / frame.h) * 100);
  const y1 = clampPct((bottom / frame.h) * 100);
  return {
    xPct: round((x0 + x1) / 2),
    yPct: round((y0 + y1) / 2),
    region: { shape: 'rect', wPct: round(x1 - x0), hPct: round(y1 - y0) },
  };
}
