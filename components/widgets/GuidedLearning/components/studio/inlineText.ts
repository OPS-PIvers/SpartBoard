/** Callout text past this many words gets a soft counter (the gl-author guidance). */
export const SOFT_WORD_LIMIT = 25;

export const countWords = (text: string): number =>
  text.trim() ? text.trim().split(/\s+/).length : 0;

/** Only https links survive `renderStepText`, so only those are accepted. */
export function safeLinkUrl(raw: string | null | undefined): string | null {
  const url = raw?.trim() ?? '';
  if (!/^https:\/\/[^\s()[\]]+$/i.test(url)) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** Wraps the selection in `before`/`after`; returns the new value and the inner selection. */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  fallback = ''
): { value: string; start: number; end: number } {
  const inner = value.slice(start, end) || fallback;
  const next =
    value.slice(0, start) + before + inner + after + value.slice(end);
  const s = start + before.length;
  return { value: next, start: s, end: s + inner.length };
}
