import type { PaperMarkupItem, PaperPointMm, PaperRectMm } from '@/types';
import { placeDisc, type Disc } from '@/utils/paperMarkupRender';
import { PAPER_MARKUP_STYLE, inkOf, markupColorOf } from './markupStyle';

const STAMP = PAPER_MARKUP_STYLE.stamp;

/** A placed pin or comment number. */
export interface DiscPlacement {
  x: number;
  y: number;
  /** Drawn diameter in mm, grown so it stays legible on screen. */
  d: number;
  halo: number;
  ink: string;
  label: string;
}

/** Pins and numbers placed the way the print places them, at least `minMm` across. */
export function layoutMarkupDiscs(
  items: readonly PaperMarkupItem[],
  numbers: ReadonlyMap<string, number>,
  view: PaperRectMm,
  minMm = 0
): Map<string, DiscPlacement> {
  const { pin, badge } = PAPER_MARKUP_STYLE;
  const taken: Disc[] = [];
  const out = new Map<string, DiscPlacement>();
  for (const item of items) {
    const num = numbers.get(item.id);
    const label = num === undefined ? '' : String(num);
    const ink = inkOf(markupColorOf(item));
    if (item.kind === 'pin') {
      const d = Math.max(pin.diameterMm, minMm);
      const p = placeDisc(item.atMm, d / 2, view, taken);
      taken.push({ ...p, r: d / 2 });
      out.set(item.id, { ...p, d, halo: pin.haloMm, ink, label });
      continue;
    }
    if (!label) continue;
    const corner: PaperPointMm =
      item.kind === 'stamp'
        ? {
            x: item.atMm.x + STAMP.sizeMm / 2,
            y: item.atMm.y - STAMP.sizeMm / 2,
          }
        : { x: item.rectMm.x + item.rectMm.w, y: item.rectMm.y };
    const d = Math.max(badge.diameterMm, minMm);
    const r = d / 2;
    const p = placeDisc(
      { x: corner.x + r * 0.3, y: corner.y - r * 0.3 },
      r,
      view,
      taken
    );
    taken.push({ ...p, r });
    out.set(item.id, { ...p, d, halo: badge.haloMm, ink, label });
  }
  return out;
}
