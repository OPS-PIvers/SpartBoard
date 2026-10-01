// Whitespace-token word count over stripped HTML, shared by editor, submit gate and graders.

const BREAKING_TAG =
  /<\/?(?:p|div|br|li|ul|ol|h[1-6]|blockquote|pre|tr|td|th|table|hr)\b[^>]*>/gi;

/** Counts whitespace-delimited words in an HTML fragment; inline tags don't split a word. */
export const countWords = (html: string): number => {
  if (!html) return 0;
  let stripped = html.replace(BREAKING_TAG, ' ');
  let previous;
  // Repeat so nested fragments like `<<b>i>` can't reassemble into a tag.
  do {
    previous = stripped;
    stripped = stripped.replace(/<[^>]+>/g, '');
  } while (stripped !== previous);
  const text = stripped
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 0;
  return text.split(' ').length;
};
