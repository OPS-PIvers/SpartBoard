/**
 * Tiny helpers for rendering Collection accent colors consistently across
 * the BoardsModal cards and badge surfaces. Hex inputs are user-set so we
 * parse defensively and fall through to undefined / a neutral fallback
 * rather than throwing — bad input shouldn't take down a card render.
 */

const parseHex = (hex: string): { r: number; g: number; b: number } | null => {
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1];
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};

/**
 * Convert a `#RGB` / `#RRGGBB` hex to an `rgba(...)` string with the given
 * alpha, or return `undefined` if the input isn't valid hex. Used for the
 * faded tints on Collection cards and the Board-card border accent.
 */
export const hexToRgba = (hex: string, alpha: number): string | undefined => {
  const rgb = parseHex(hex);
  if (!rgb) return undefined;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

// W3C-style relative luminance from gamma-decoded sRGB. Internal helper —
// matches what a real contrast check would compute. Used by both
// foreground-picking and the hue-preserving text-darkening routine.
const relativeLuminance = (rgb: {
  r: number;
  g: number;
  b: number;
}): number => {
  const lin = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
};

// WCAG-derived luminance cutoff for "prefer dark text over white". A
// background is dark enough for white text to clear 4.5:1 (AA normal text)
// only when its luminance is <= ~0.179. Using the naive 0.5 midpoint would
// pick white text for mid-tone hues like Amber, Sky, Teal — those then
// flunk AA on projectors and washed-out displays, which CLAUDE.md calls
// out as a hard requirement.
const DARK_TEXT_THRESHOLD = 0.179;

/**
 * Pick `'#0f172a'` (slate-900) or `'#ffffff'` as the readable foreground
 * for text/icons painted directly on top of `hex`. Slate-900 reads softer
 * than pure black on bright swatches and matches the rest of the UI's
 * text palette.
 *
 * Falls back to slate-900 for unparseable input — safe default on the
 * neutral badge background we'd otherwise be rendering.
 */
export const pickReadableForeground = (hex: string): string => {
  const rgb = parseHex(hex);
  if (!rgb) return '#0f172a';
  return relativeLuminance(rgb) > DARK_TEXT_THRESHOLD ? '#0f172a' : '#ffffff';
};

// Slate-900 — the project's near-black token. Used as the mix-in when
// darkening light Collection colors for text use.
const SLATE_900 = { r: 15, g: 23, b: 42 };

/**
 * Hue-preserving text color for use on the faded (~white) Collection card
 * background. Dark inputs are returned unchanged — they read fine on the
 * tint. Light inputs are blended 50/50 with slate-900 so the text doesn't
 * wash out into the card background while still keeping the Collection's
 * hue. Returns `undefined` for unparseable input so callers fall back to
 * the default slate text colour.
 */
export const collectionTextColor = (hex: string): string | undefined => {
  const rgb = parseHex(hex);
  if (!rgb) return undefined;
  // Same WCAG-derived threshold as pickReadableForeground: only treat the
  // hue as "dark enough to use as-is on near-white card tint" when it
  // clears the 4.5:1 contrast target.
  if (relativeLuminance(rgb) <= DARK_TEXT_THRESHOLD) return hex;
  const mix = {
    r: Math.round((rgb.r + SLATE_900.r) / 2),
    g: Math.round((rgb.g + SLATE_900.g) / 2),
    b: Math.round((rgb.b + SLATE_900.b) / 2),
  };
  return `rgb(${mix.r}, ${mix.g}, ${mix.b})`;
};
