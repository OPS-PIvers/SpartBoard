export const getFontClass = (fontFamily: string, globalFont: string) => {
  if (fontFamily === 'global') return `font-${globalFont}`;
  if (fontFamily.startsWith('font-')) return fontFamily;
  return `font-${fontFamily}`;
};

export const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
