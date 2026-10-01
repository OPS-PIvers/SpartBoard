// Whitespace-token word count over stripped HTML, shared by editor, submit gate and graders.

const BREAKING_TAG =
  /<\/?(?:p|div|br|li|ul|ol|h[1-6]|blockquote|pre|tr|td|th|table|hr)\b[^>]*>/gi;

/** Counts whitespace-delimited words in an HTML fragment; inline tags don't split a word. */
export const countWords = (html: string): number => {
  if (!html) return 0;
  const text = html
    .replace(BREAKING_TAG, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 0;
  return text.split(' ').length;
};
