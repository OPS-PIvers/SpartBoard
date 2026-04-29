/**
 * Returns a text-safe variant of `accent` so titles colored with the station's
 * accent stay legible over a near-white background. Light accents (yellow,
 * lime, sky, etc.) get pushed darker via HSL until the relative luminance
 * gives ≥ 4.5:1 contrast against white (the WCAG AA threshold for body text).
 *
 * Returns the original color when its contrast against white already passes.
 */

const TARGET_CONTRAST = 4.5;
const WHITE_LUMINANCE = 1;

const parseHex = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return null;
  let body = m[1];
  if (body.length === 3) {
    body = body[0] + body[0] + body[1] + body[1] + body[2] + body[2];
  }
  return [
    parseInt(body.slice(0, 2), 16) / 255,
    parseInt(body.slice(2, 4), 16) / 255,
    parseInt(body.slice(4, 6), 16) / 255,
  ];
};

const channelLuminance = (v: number): number =>
  v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

const relativeLuminance = (rgb: [number, number, number]): number => {
  const [r, g, b] = rgb.map(channelLuminance) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastVsWhite = (rgb: [number, number, number]): number => {
  const lum = relativeLuminance(rgb);
  return (WHITE_LUMINANCE + 0.05) / (lum + 0.05);
};

const rgbToHsl = (
  r: number,
  g: number,
  b: number
): [number, number, number] => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    case b:
      h = (r - g) / d + 4;
      break;
  }
  h /= 6;
  return [h, s, l];
};

const hslToRgb = (
  h: number,
  s: number,
  l: number
): [number, number, number] => {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue2rgb(h + 1 / 3), hue2rgb(h), hue2rgb(h - 1 / 3)];
};

const toHex = (rgb: [number, number, number]): string => {
  const [r, g, b] = rgb;
  const channel = (v: number): string =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
};

export function getAccessibleAccentText(accent: string): string {
  const rgb = parseHex(accent);
  if (!rgb) return accent;

  // Already passes the contrast check? Preserve the original color.
  if (contrastVsWhite(rgb) >= TARGET_CONTRAST) {
    // Always re-emit normalized #rrggbb so callers don't see a mix of formats.
    return toHex(rgb);
  }

  const [h, s] = rgbToHsl(...rgb);
  // Step lightness down until contrast clears the bar (or we hit black).
  let l = 0.5;
  for (let i = 0; i < 50; i++) {
    const candidate = hslToRgb(h, s, l);
    if (contrastVsWhite(candidate) >= TARGET_CONTRAST) {
      return toHex(candidate);
    }
    l -= 0.02;
    if (l <= 0) break;
  }
  return '#000000';
}
