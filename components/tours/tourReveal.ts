import { isTourAnchorId, parseTourAnchorRef } from '@/config/tourAnchors';

const HOVER_SHOWN =
  '[class*="opacity-0"]:is([class*="hover:opacity-100"],[class*="focus-within:opacity-100"])';
const TOUR_ATTR = 'data-tour';
const HOVER_VISIBLE = '[class*="hover:visible"]';
const HOVER_CLICKABLE = '[class*="hover:pointer-events-auto"]';

/** CSS that shows a tour's hover-only controls, and whatever a `data-tour-reveal-swap` says sits under them. */
export function tourRevealCss(anchorRefs: readonly string[]): string {
  const ids = [
    ...new Set(anchorRefs.map((ref) => parseTourAnchorRef(ref).id)),
  ].filter(isTourAnchorId);
  if (ids.length === 0) return '';
  const tagged = ids
    .map((id) => `[${TOUR_ATTR}="${id}"],:has([${TOUR_ATTR}="${id}"])`)
    .join(',');
  const swaps = ids.map((id) => `[data-tour-reveal-swap="${id}"]`).join(',');
  return [
    `${HOVER_SHOWN}:is(${tagged}){opacity:1!important}`,
    `:is(${HOVER_VISIBLE}):is(${tagged}){visibility:visible!important}`,
    `:is(${HOVER_CLICKABLE}):is(${tagged}){pointer-events:auto!important}`,
    `:is(${swaps}){opacity:0!important}`,
  ].join('\n');
}

/** Keeps the hover-only controls a running tour points at on screen, since a step can't hover; returns the undo. */
export function revealTourAnchors(
  anchorRefs: readonly string[],
  doc: Document = document
): () => void {
  const css = tourRevealCss(anchorRefs);
  if (!css) return () => undefined;
  const style = doc.createElement('style');
  style.setAttribute('data-tour-reveal', '');
  style.textContent = css;
  doc.head.appendChild(style);
  return () => style.remove();
}
