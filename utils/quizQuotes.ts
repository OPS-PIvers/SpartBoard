/** Marks a passage quote inside a written response; the value is the source stimulus id. */
export const QUOTE_ATTR = 'data-quote';
/** The passage words as inserted, so an edited quote can be told apart from an exact one. */
export const QUOTE_TEXT_ATTR = 'data-quote-text';

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Flattens a selection from a passage or PDF into one line of quotable text. */
export function cleanQuoteText(raw: string): string {
  return normalize(raw.replace(/-\n(?=\S)/g, ''));
}

/** True when the quoted words no longer match what was taken from the passage. */
export function isQuoteEdited(current: string, original: string): boolean {
  return normalize(current) !== normalize(original);
}

/** `“<span data-quote>words</span>” ` — marks and trailing space sit outside so typing after it stays the student's own. */
export function buildQuoteNodes(
  doc: Document,
  quote: { stimulusId: string; text: string }
): Node[] {
  const span = doc.createElement('span');
  span.setAttribute(QUOTE_ATTR, quote.stimulusId);
  span.setAttribute(QUOTE_TEXT_ATTR, quote.text);
  span.textContent = quote.text;
  return [doc.createTextNode('“'), span, doc.createTextNode('” ')];
}
