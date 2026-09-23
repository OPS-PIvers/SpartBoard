/** Step text without its `**bold**` and `[label](url)` markup, for speech and screen readers. */
export function plainStepText(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "label. text" for a step, skipping whichever part is empty. */
export function spokenStepText(step: {
  label?: string;
  text?: string;
}): string {
  const label = plainStepText(step.label);
  const text = plainStepText(step.text);
  if (label && text) return `${label}. ${text}`;
  return label || text;
}
