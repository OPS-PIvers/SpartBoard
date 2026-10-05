import type { BackgroundLayer } from './snapshotTypes';

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

const COLOR_RE = /rgba?\(([^)]+)\)|color\(srgb ([^)]+)\)/g;

const fromMatch = (m: RegExpExecArray): Rgba | null => {
  if (m[1]) {
    const p = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    if (p.length < 3 || p.some((n) => !Number.isFinite(n))) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  const p = m[2]
    .split(/[\s/]+/)
    .filter(Boolean)
    .map(Number);
  if (p.length < 3 || p.some((n) => !Number.isFinite(n))) return null;
  return {
    r: p[0] * 255,
    g: p[1] * 255,
    b: p[2] * 255,
    a: p.length > 3 ? p[3] : 1,
  };
};

export const parseColor = (value: string): Rgba | null => {
  COLOR_RE.lastIndex = 0;
  const m = COLOR_RE.exec(value);
  return m ? fromMatch(m) : null;
};

/** Every colour stop in a gradient; null when the image is a URL or unparseable. */
export const gradientColors = (image: string): Rgba[] | null => {
  if (image.includes('url(')) return null;
  const out: Rgba[] = [];
  COLOR_RE.lastIndex = 0;
  for (let m = COLOR_RE.exec(image); m; m = COLOR_RE.exec(image)) {
    const c = fromMatch(m);
    if (c) out.push(c);
  }
  return out.length ? out : null;
};

export const over = (top: Rgba, base: Rgba): Rgba => ({
  r: top.r * top.a + base.r * (1 - top.a),
  g: top.g * top.a + base.g * (1 - top.a),
  b: top.b * top.a + base.b * (1 - top.a),
  a: 1,
});

const paint = (top: Rgba, under: Rgba[] | null): Rgba[] | null => {
  if (top.a >= 0.999) return [{ ...top, a: 1 }];
  if (top.a <= 0.001) return under;
  return under ? under.map((u) => over(top, u)) : null;
};

/** Possible solid backdrops behind a text, one per gradient stop; null when an image makes it unknowable. */
export const backdrops = (layers: BackgroundLayer[]): Rgba[] | null => {
  let under: Rgba[] | null = [WHITE];
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    const color = parseColor(layer.color);
    if (color) under = paint(color, under);
    if (layer.image) {
      const stops = gradientColors(layer.image);
      if (!stops) under = null;
      else {
        const next: Rgba[] = [];
        for (const stop of stops) {
          const painted = paint(stop, under);
          if (!painted) {
            under = null;
            break;
          }
          next.push(...painted);
        }
        if (under) under = next;
      }
    }
  }
  return under;
};

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export const luminance = (c: Rgba): number =>
  0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);

export const contrastRatio = (a: Rgba, b: Rgba): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** Worst-case contrast of a text colour over its layers; null when the backdrop is unknowable. */
export const worstContrast = (
  color: string,
  layers: BackgroundLayer[]
): number | null => {
  const fg = parseColor(color);
  const bgs = backdrops(layers);
  if (!fg || !bgs || bgs.length === 0) return null;
  return Math.min(...bgs.map((bg) => contrastRatio(over(fg, bg), bg)));
};
