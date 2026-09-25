import { CALLOUT_TEXT_CAP_PX, CALLOUT_TEXT_FLOOR_PX } from './calloutStyle';

export interface CalloutFit {
  /** Body font size in px; the title is CALLOUT_TITLE_RATIO times this. */
  bodyPx: number;
  /** Rendered height: the box's own, or taller when the text needs it at the floor (G10). */
  heightPx: number;
  /** True when the text does not fit the box even at the floor. */
  overflow: boolean;
}

const STEP_PX = 0.25;

/** Largest body size in [floor, cap] whose measured card height fits boxH; measure gets a body px. */
export function fitCalloutText({
  boxH,
  measure,
  floor = CALLOUT_TEXT_FLOOR_PX,
  cap = CALLOUT_TEXT_CAP_PX,
}: {
  boxH: number;
  measure: (bodyPx: number) => number;
  floor?: number;
  cap?: number;
}): CalloutFit {
  const atFloor = measure(floor);
  if (atFloor > boxH) {
    return { bodyPx: floor, heightPx: Math.ceil(atFloor), overflow: true };
  }
  if (measure(cap) <= boxH) {
    return { bodyPx: cap, heightPx: boxH, overflow: false };
  }
  // Search the STEP_PX grid so the result is exact and identical on every surface.
  let lo = 0;
  let hi = Math.floor((cap - floor) / STEP_PX);
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (measure(floor + mid * STEP_PX) <= boxH) lo = mid;
    else hi = mid;
  }
  return {
    bodyPx: floor + lo * STEP_PX,
    heightPx: boxH,
    overflow: false,
  };
}
