/**
 * Robust JSON extraction for Gemini responses. Gemini occasionally returns
 * the requested JSON object followed by a trailing explanation, markdown
 * code fences, or a stray newline. `JSON.parse` on that raw text throws
 * "Unexpected non-whitespace character after JSON …".
 *
 * This helper strips fences and trims to the outermost `{ … }` slice before
 * parsing. Callers still get a thrown error on genuinely malformed JSON.
 */
export const parseGeminiJson = <T>(raw: string): T => {
  const trimmed = (raw ?? '').trim();
  if (trimmed.length === 0) {
    throw new Error('Empty response from AI');
  }

  const fenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  // Walk forward from the first `{` counting brace depth to find the
  // *matching* closing brace for the outermost JSON object. Using
  // `lastIndexOf('}')` is incorrect: any `}` in trailing prose
  // (explanations, CSS examples, JSON notation) would extend the slice past
  // the JSON boundary and cause JSON.parse to throw even though the embedded
  // JSON is valid.
  const firstBrace = fenced.indexOf('{');
  let slice = fenced;
  if (firstBrace !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    let closingPos = -1;
    for (let i = firstBrace; i < fenced.length; i++) {
      const ch = fenced[i];
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
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            closingPos = i;
            break;
          }
        }
      }
    }
    if (closingPos !== -1) {
      slice = fenced.slice(firstBrace, closingPos + 1);
    }
  }

  return JSON.parse(slice) as T;
};
