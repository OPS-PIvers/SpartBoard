export const getFontClass = (fontFamily: string, globalFont: string) => {
  if (fontFamily === 'global') return `font-${globalFont}`;
  if (fontFamily.startsWith('font-')) return fontFamily;
  return `font-${fontFamily}`;
};

/** Converts a hex color + alpha into an rgba() CSS string. */
export const hexToRgba = (hex: string | undefined, alpha: number): string => {
  const clean = (hex ?? '#ffffff').replace('#', '');
  const a =
    typeof alpha === 'number' && !isNaN(alpha)
      ? Math.max(0, Math.min(1, alpha))
      : 1;
  if (clean.length !== 6) return `rgba(255, 255, 255, ${a})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(255, 255, 255, ${a})`;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};
