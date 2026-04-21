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

  const firstBrace = fenced.indexOf('{');
  const lastBrace = fenced.lastIndexOf('}');
  const slice =
    firstBrace !== -1 && lastBrace > firstBrace
      ? fenced.slice(firstBrace, lastBrace + 1)
      : fenced;

  return JSON.parse(slice) as T;
};
