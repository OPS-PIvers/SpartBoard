import { FONTS, FONT_COLORS } from '@/config/fonts';

export const PALETTE = [
  '#ffffff', // Default white
  '#f8fafc', // slate-50
  '#f0f9ff', // sky-50
  '#f5f3ff', // violet-50
  '#fff7ed', // orange-50
  '#f0fdf4', // green-50
  '#fff1f2', // rose-50
];

export { FONTS, FONT_COLORS };

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
