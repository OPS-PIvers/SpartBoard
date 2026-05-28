/**
 * Sanitizes user input for AI prompts to mitigate prompt injection.
 * Escapes characters used for prompt injection (like tags, delimiters, and control sequences)
 * and flattens all whitespace (newlines and carriage returns) into single spaces.
 */
export const sanitizePrompt = (text?: string): string => {
  if (typeof text !== 'string' || text.length === 0) return '';
  return (
    text
      // Escape `&` FIRST so any `&` the user typed becomes `&amp;` before we
      // introduce our own HTML entity sequences. Without this step a user can
      // smuggle `{` / `<` / etc. through by pre-typing the entity code: the
      // input `&#123;` would survive all subsequent replacements unchanged and
      // the AI ultimately sees a curly brace again. Escaping `&` → `&amp;`
      // first means `&#123;` becomes `&amp;#123;` — a literal string of
      // printable characters with no structural meaning in HTML or JSON.
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\{/g, '&#123;')
      .replace(/\}/g, '&#125;')
      .replace(/\[/g, '&#91;')
      .replace(/\]/g, '&#93;')
      .replace(/`/g, '&#96;')
      .replace(/[\r\n]+/g, ' ')
      .trim()
  );
};
