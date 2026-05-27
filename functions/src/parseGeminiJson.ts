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

  // Detect whether the response is a top-level array or object and find the
  // matching opener so we can extract the correct slice.
  //
  // When Gemini returns an array of objects, e.g. `[{…},{…}]` optionally
  // followed by trailing prose, the previous brace-only scanner would find
  // the first `{` *inside* the array and close at depth 0 on the *first*
  // object's `}`, silently truncating every subsequent element.
  const firstBracket = fenced.indexOf('[');
  const firstBrace = fenced.indexOf('{');

  // Try the array path first when its opener appears before any brace, but
  // fall back to the brace path if parsing the array slice fails — leading
  // prose may contain a stray `[` (e.g. a Markdown link `[docs]`) that
  // precedes the real JSON object.
  const tryArrayFirst =
    firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace);

  if (tryArrayFirst) {
    const closingPos = scanToClose(fenced, firstBracket, '[', ']');
    if (closingPos !== -1) {
      const candidate = fenced.slice(firstBracket, closingPos + 1);
      try {
        return JSON.parse(candidate) as T;
      } catch {
        // Stray `[…]` in leading prose — fall through to the brace path.
      }
    }
  }

  let slice = fenced;
  if (firstBrace !== -1) {
    const closingPos = scanToClose(fenced, firstBrace, '{', '}');
    if (closingPos !== -1) {
      slice = fenced.slice(firstBrace, closingPos + 1);
    }
  }

  return JSON.parse(slice) as T;
};
