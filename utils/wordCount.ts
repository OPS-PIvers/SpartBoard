// Whitespace-token word count over stripped HTML, shared by editor, submit gate and graders.
import { countWritingWords } from '@/utils/writingResponseState';

/** Counts whitespace-delimited words in an HTML fragment in linear time; inline tags don't split a word. */
export const countWords = (html: string): number => countWritingWords(html);

let lastHtml: string | null = null;
let lastCount = 0;

/** countWords that remembers the last answer, so a re-render of the same answer doesn't count it again. */
export const countWordsCached = (html: string): number => {
  if (html !== lastHtml) {
    lastCount = countWords(html);
    lastHtml = html;
  }
  return lastCount;
};
