/**
 * Converts a hex color string and an alpha value into an rgba() CSS string.
 * @param hex The hex color string (e.g., '#ff0000'). Defaults to white if invalid.
 * @param alpha The alpha transparency value (0-1). Defaults to 1 if invalid.
 * @returns An rgba() color string.
 */
export const hexToRgba = (hex: string, alpha: number): string => {
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
