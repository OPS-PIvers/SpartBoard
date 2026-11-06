// Draws the equations in a written answer; the saved text of each stays its plain math.
import DOMPurify from 'dompurify';
import { MATH_ATTR } from '@/utils/mathAnswer';
import { loadMathLive } from './loadMathLive';

/** Holds a chip's plain math while its visible contents are the drawn equation. */
export const MATH_PLAIN_ATTR = 'data-math-plain';

const chipsIn = (root: ParentNode): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(`span[${MATH_ATTR}]`));

/** MathLive's static markup with anything but its drawing tags removed. */
export function sanitizeMathMarkup(markup: string): string {
  return DOMPurify.sanitize(markup, {
    ALLOWED_TAGS: ['span', 'svg', 'path', 'line'],
    ALLOWED_ATTR: [
      'class',
      'style',
      'd',
      'viewBox',
      'width',
      'height',
      'preserveAspectRatio',
      'x1',
      'x2',
      'y1',
      'y2',
      'stroke-width',
    ],
  });
}

/** Replaces each chip's text with the drawn equation; a no-op when there are none. */
export async function drawMathChips(root: HTMLElement): Promise<void> {
  const chips = chipsIn(root).filter((c) => !c.hasAttribute(MATH_PLAIN_ATTR));
  if (chips.length === 0) return;
  const ml = await loadMathLive();
  for (const chip of chips) {
    if (!root.contains(chip) || chip.hasAttribute(MATH_PLAIN_ATTR)) continue;
    chip.setAttribute(MATH_PLAIN_ATTR, chip.textContent ?? '');
    chip.setAttribute('contenteditable', 'false');
    const markup = ml.convertLatexToMarkup(chip.getAttribute(MATH_ATTR) ?? '');
    chip.innerHTML = sanitizeMathMarkup(markup);
  }
}

/** HTML for saving: each drawn chip goes back to its plain math text. */
export function plainMathHtml(root: HTMLElement): string {
  const drawn = chipsIn(root).filter((c) => c.hasAttribute(MATH_PLAIN_ATTR));
  if (drawn.length === 0) return root.innerHTML;
  const copy = root.cloneNode(true);
  if (!(copy instanceof HTMLElement)) return root.innerHTML;
  for (const chip of chipsIn(copy)) {
    const plain = chip.getAttribute(MATH_PLAIN_ATTR);
    if (plain !== null) chip.textContent = plain;
    chip.removeAttribute(MATH_PLAIN_ATTR);
    chip.removeAttribute('contenteditable');
  }
  return copy.innerHTML;
}
