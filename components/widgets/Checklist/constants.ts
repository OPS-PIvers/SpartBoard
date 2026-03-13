export const FONTS = [
  { id: 'global', label: 'Inherit', icon: 'G' },
  { id: 'font-mono', label: 'Digital', icon: '01' },
  { id: 'font-sans', label: 'Modern', icon: 'Aa' },
  { id: 'font-handwritten', label: 'School', icon: '✏️' },
];

export const PALETTE = [
  '#ffffff', // Default white
  '#f8fafc', // slate-50
  '#f0f9ff', // sky-50
  '#f5f3ff', // violet-50
  '#fff7ed', // orange-50
  '#f0fdf4', // green-50
  '#fff1f2', // rose-50
];

export const FONT_COLORS = [
  '#334155', // slate-700 (default)
  '#1e293b', // slate-800
  '#000000', // pure black
  '#2d3f89', // brand-blue
  '#ad2122', // brand-red
  '#166534', // green-800
  '#1e40af', // blue-800
];

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
