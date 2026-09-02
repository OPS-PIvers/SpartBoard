/**
 * Word counting for written quiz responses, shared by the student editor,
 * the submit gate and the teacher's grading views so every surface reports
 * the same number for the same HTML.
 *
 * Known limitation: this is a whitespace-delimited token count. CJK scripts
 * (Chinese / Japanese / Korean) without inter-word spaces under-count (a
 * 400-character Mandarin response counts as 1 "word"), and HTML entities
 * like `&amp;` survive the tag-strip and inflate the count by one. Swapping
 * to `Intl.Segmenter(locale, { granularity: 'word' })` over the editor's
 * `textContent` is the fix if non-Latin classrooms surface this as a real
 * problem.
 */

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
