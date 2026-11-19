/** A dictated phrase as a blank's answer: no leading space, no closing punctuation. */
export const blankPhrase = (text: string): string =>
  text
    .trim()
    .replace(/[.!?,;:。]+$/u, '')
    .trim();

/** Marks the element holding one blank's text box and its Dictate mic. */
export const FIB_ROW_ATTR = 'data-fib-row';
