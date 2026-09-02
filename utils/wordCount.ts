// Whitespace-token word count over stripped HTML, shared by editor, submit gate and graders.

/** Counts whitespace-delimited words in an HTML fragment. */
export const countWords = (html: string): number => {
  if (!html) return 0;
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 0;
  return text.split(' ').length;
};
