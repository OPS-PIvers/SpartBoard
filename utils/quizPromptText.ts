const LONG_PROMPT_CHARS = 180;

/** Whether a prompt is long enough to read as paragraphs instead of one bold heading. */
export const isLongPrompt = (text: string): boolean =>
  text.trim().includes('\n') || text.length > LONG_PROMPT_CHARS;

/** A blank line between paragraphs, so a long prompt is not one block. */
export const spacedPrompt = (text: string): string =>
  text.trim().replace(/[ \t]*\n\s*/g, '\n\n');
