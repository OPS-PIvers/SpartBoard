const LONG_PROMPT_CHARS = 180;

/** Whether a prompt is long enough to read as paragraphs instead of one bold heading. */
export const isLongPrompt = (text: string): boolean =>
  text.trim().includes('\n') || text.length > LONG_PROMPT_CHARS;

// A table row, or a numbered, lettered, Roman or bulleted item: these stay one per line.
const STRUCTURED_LINE =
  /\s\|\s|^\s*(?:\(?(?:\d{1,3}|[A-Za-z]|[IVXivx]{1,5})[.)]|[-•*])\s/;

/** A blank line between paragraphs, so a long prompt is not one block; table rows and list items stay together. */
export function spacedPrompt(text: string): string {
  const lines = text
    .trim()
    .split('\n')
    .map((l) => l.trimEnd());
  const out: string[] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      continue;
    }
    const prev = out[out.length - 1];
    if (
      prev !== undefined &&
      prev !== '' &&
      !(STRUCTURED_LINE.test(prev) && STRUCTURED_LINE.test(line))
    ) {
      out.push('');
    }
    out.push(line.trimStart());
  }
  return out.join('\n');
}
