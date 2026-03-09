/**
 * Sanitizes user input for AI prompts to mitigate prompt injection.
 * Escapes characters used for prompt injection (like tags, delimiters, and control sequences)
 * and flattens all whitespace (newlines and carriage returns) into single spaces.
 */
export const sanitizePrompt = (text?: string): string => {
  if (typeof text !== 'string' || text.length === 0) return '';
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;')
    .replace(/`/g, '&#96;')
    .replace(/[\r\n]+/g, ' ')
    .trim();
};
