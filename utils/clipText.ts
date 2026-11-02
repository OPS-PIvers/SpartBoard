/** Clips to at most `max` UTF-16 units without leaving half of a surrogate pair. */
export const clipText = (text: string, max: number): string => {
  if (text.length <= max) return text;
  const end = /[\uD800-\uDBFF]/.test(text[max - 1] ?? '') ? max - 1 : max;
  return text.slice(0, end);
};
