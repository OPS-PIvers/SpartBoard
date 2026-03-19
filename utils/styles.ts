export const getFontClass = (fontFamily: string, globalFont: string) => {
  if (fontFamily === 'global') return `font-${globalFont}`;
  if (fontFamily.startsWith('font-')) return fontFamily;
  return `font-${fontFamily}`;
};
