/**
 * Sanitizes user input for AI prompts to mitigate prompt injection.
 * Escapes characters used for prompt injection (like tags, delimiters, and control sequences)
 * and flattens all whitespace (newlines and carriage returns) into single spaces.
 */
const ESCAPE_MAP: Record<string, string> = {
  // `&` is escaped here too: a single-pass replacement on the source string
  // naturally prevents double-escaping (the `&` inside the inserted `&lt;`
  // etc. is never re-evaluated), so a pre-typed `&#123;` survives as the
  // literal string `&amp;#123;` with no structural meaning in HTML or JSON.
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '{': '&#123;',
  '}': '&#125;',
  '[': '&#91;',
  ']': '&#93;',
  '`': '&#96;',
  // `"` is escaped to prevent JSON-context prompt injection: AI generators
  // that return `application/json` responses embed the sanitized user input
  // inside XML-like delimiters (e.g. <topic>…</topic>), but an unescaped
  // double-quote lets an attacker close a JSON string and append rogue fields.
  // Encoding `"` as `&quot;` makes it opaque to the model's JSON layer.
  '"': '&quot;',
};

export const sanitizePrompt = (text?: string): string => {
  if (typeof text !== 'string' || text.length === 0) return '';
  return text
    .replace(/[&<>{}[\]`"]/g, (ch) => ESCAPE_MAP[ch])
    .replace(/[\r\n]+/g, ' ')
    .trim();
};
