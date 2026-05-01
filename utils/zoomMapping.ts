// Zoom slider mapping: range 0.5×–5× with 1× anchored at the visual midpoint.
// Linear scales make 100% feel left-of-center; this piecewise map gives the
// teacher a slider that *feels* like the middle is "no zoom".

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 5;
export const ZOOM_DEFAULT = 1;

// Slider raw range is [0, 100]. 50 corresponds to zoom = 1.
export const SLIDER_MIN = 0;
export const SLIDER_MAX = 100;
export const SLIDER_MID = 50;

export const sliderToZoom = (sliderValue: number): number => {
  const v = Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, sliderValue));
  const z =
    v <= SLIDER_MID
      ? ZOOM_MIN + (v / SLIDER_MID) * (ZOOM_DEFAULT - ZOOM_MIN)
      : ZOOM_DEFAULT +
        ((v - SLIDER_MID) / SLIDER_MID) * (ZOOM_MAX - ZOOM_DEFAULT);
  return Math.round(z * 100) / 100;
};

export const zoomToSlider = (zoom: number): number => {
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  return z <= ZOOM_DEFAULT
    ? ((z - ZOOM_MIN) / (ZOOM_DEFAULT - ZOOM_MIN)) * SLIDER_MID
    : SLIDER_MID +
        ((z - ZOOM_DEFAULT) / (ZOOM_MAX - ZOOM_DEFAULT)) * SLIDER_MID;
};

// Round to 2 decimals so wheel-zoom increments (0.1 step) don't accumulate
// float drift like 0.9999999999999999 — that would make strict equality
// against ZOOM_DEFAULT (`zoom !== 1`) misfire and leave the inline reset FAB
// visible at what visually reads as "100%".
export const clampZoom = (zoom: number): number => {
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  return Math.round(clamped * 100) / 100;
};
