/**
 * Robust JSON extraction for Gemini responses. Gemini occasionally returns
 * the requested JSON followed by a trailing explanation, markdown code
 * fences, or a stray newline. `JSON.parse` on that raw text throws
 * "Unexpected non-whitespace character after JSON …".
 *
 * This helper strips fences and trims to the outermost `{ … }` or `[ … ]`
 * slice before parsing. Callers still get a thrown error on genuinely
 * malformed JSON.
 */

/**
 * Walk forward from `startPos` counting depth for `openCh`/`closeCh` pairs,
 * correctly skipping characters inside JSON strings. Returns the index of
 * the character that closes the outermost pair, or -1 if the string ends
 * before depth returns to zero.
 */
function scanToClose(
  s: string,
  startPos: number,
  openCh: string,
  closeCh: string
): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startPos; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === openCh) depth++;
      else if (ch === closeCh) {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

export const parseGeminiJson = <T>(raw: string): T => {
  const trimmed = (raw ?? '').trim();
  if (trimmed.length === 0) {
    throw new Error('Empty response from AI');
  }

  const fenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  // Try each top-level `{`/`[` in order, skipping stray ones in leading prose (e.g. `{x}` or `[docs]`).
  let pos = 0;
  while (pos < fenced.length) {
    const rest = fenced.slice(pos);
    const m = /[[{]/.exec(rest);
    if (!m) break;
    const start = pos + m.index;
    const closeCh = fenced[start] === '[' ? ']' : '}';
    const end = scanToClose(fenced, start, fenced[start], closeCh);
    if (end === -1) {
      pos = start + 1;
      continue;
    }
    try {
      return JSON.parse(fenced.slice(start, end + 1)) as T;
    } catch {
      pos = end + 1;
    }
  }

  return JSON.parse(fenced) as T;
};
