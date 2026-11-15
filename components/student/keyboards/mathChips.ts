// Draws the equations in a written answer; the saved text of each stays its plain math.
import DOMPurify from 'dompurify';
import { MATH_ATTR } from '@/utils/mathAnswer';
import { loadMathLive } from './loadMathLive';

/** Holds a chip's plain math while its visible contents are the drawn equation. */
export const MATH_PLAIN_ATTR = 'data-math-plain';

const chipsIn = (root: ParentNode): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(`span[${MATH_ATTR}]`));

/** Longest math source drawn as an equation; longer text shows as typed. */
export const MAX_DRAWN_MATH_LENGTH = 1000;
const MAX_MARKUP_LENGTH = 200_000;

// Class names MathLive itself emits; anything else (e.g. app utility classes from \class) is dropped.
const MATHLIVE_CLASS =
  /^(ML__[\w-]+|col-align-[clmr]|delim-size\d|[lu]cGreek|(over|under)line(-line)?|slice-\d-of-\d|style-wrap)$/;
const NUM = String.raw`-?(\d+\.?\d*|\.\d+)`;
const LENGTH = new RegExp(
  String.raw`^(${NUM}(em|ex|px|%)?|calc\([\d\s.+*/()emxp%-]+\))$`
);
const COLOR =
  /^(#[0-9a-f]{3,8}|transparent|currentcolor|[a-z]{3,20}|rgba?\([\d\s.,%]+\))$/i;
const BORDER_STYLE = /^(solid|dashed|dotted|double|none)$/;

const isLength = (v: string, emLimit = 40): boolean =>
  LENGTH.test(v) && withinBounds(v, emLimit);
// Bounded sizes keep an equation from stretching far past its own row.
function withinBounds(v: string, emLimit: number): boolean {
  for (const m of v.matchAll(/(-?\d*\.?\d+)(em|ex|px|%)?/g)) {
    const n = Math.abs(Number(m[1]));
    const limit = m[2] === '%' ? 400 : m[2] === 'px' ? 64 : emLimit;
    if (n > limit) return false;
  }
  return true;
}

const STYLE_RULES: Record<string, (v: string) => boolean> = {
  height: (v) => isLength(v),
  width: (v) => isLength(v),
  'min-width': (v) => isLength(v),
  'vertical-align': (v) => isLength(v),
  top: (v) => isLength(v),
  left: (v) => isLength(v),
  'margin-left': (v) => isLength(v),
  'margin-right': (v) => isLength(v),
  'margin-top': (v) => isLength(v),
  'padding-left': (v) => isLength(v),
  'padding-right': (v) => isLength(v),
  'border-top-width': (v) => isLength(v),
  'border-right-width': (v) => isLength(v),
  'border-bottom-width': (v) => isLength(v),
  'border-radius': (v) => isLength(v),
  'font-size': (v) => isLength(v),
  'line-height': (v) => isLength(v),
  display: (v) => /^(inline-block|inline|block|none)$/.test(v),
  position: (v) => v === 'relative' || v === 'absolute',
  'z-index': (v) => /^-?\d$/.test(v),
  'box-sizing': (v) => v === 'border-box' || v === 'content-box',
  overflow: (v) => v === 'visible' || v === 'hidden',
  opacity: (v) => /^(0|1|0?\.\d+)$/.test(v),
  color: (v) => COLOR.test(v),
  'background-color': (v) => COLOR.test(v),
  '--bg-color': (v) => COLOR.test(v),
  border: (v) =>
    v
      .split(/\s+/)
      .every((t) => isLength(t) || BORDER_STYLE.test(t) || COLOR.test(t)),
};

/** Keeps only the layout declarations MathLive generates, with bounded sizes and no URLs. */
export function safeMathStyle(style: string): string {
  const kept: string[] = [];
  for (const decl of style.split(';')) {
    const at = decl.indexOf(':');
    if (at < 0) continue;
    const prop = decl.slice(0, at).trim().toLowerCase();
    const value = decl.slice(at + 1).trim();
    if (STYLE_RULES[prop]?.(value)) kept.push(`${prop}:${value}`);
  }
  return kept.join(';');
}

/** MathLive's static markup with its drawing tags kept and every class and style limited to MathLive's own; '' when too large. */
export function sanitizeMathMarkup(markup: string): string {
  if (markup.length > MAX_MARKUP_LENGTH) return '';
  const fragment = DOMPurify.sanitize(markup, {
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
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  for (const el of Array.from(fragment.querySelectorAll('*'))) {
    const cls = el.getAttribute('class');
    if (cls !== null) {
      const kept = cls.split(/\s+/).filter((c) => MATHLIVE_CLASS.test(c));
      if (kept.length > 0) el.setAttribute('class', kept.join(' '));
      else el.removeAttribute('class');
    }
    const style = el.getAttribute('style');
    if (style !== null) {
      const kept = safeMathStyle(style);
      if (kept) el.setAttribute('style', kept);
      else el.removeAttribute('style');
    }
    // Stretchy SVGs are drawn 400em wide and sliced by their own box.
    for (const attr of ['width', 'height']) {
      const v = el.getAttribute(attr);
      if (v !== null && !isLength(v, 400)) el.removeAttribute(attr);
    }
  }
  const holder = document.createElement('div');
  holder.append(fragment);
  return holder.innerHTML;
}

/** Replaces each chip's text with the drawn equation; a no-op when there are none. */
export async function drawMathChips(root: HTMLElement): Promise<void> {
  const chips = chipsIn(root).filter((c) => !c.hasAttribute(MATH_PLAIN_ATTR));
  if (chips.length === 0) return;
  const ml = await loadMathLive();
  for (const chip of chips) {
    if (!root.contains(chip) || chip.hasAttribute(MATH_PLAIN_ATTR)) continue;
    const math = chip.getAttribute(MATH_ATTR) ?? '';
    if (math.length > MAX_DRAWN_MATH_LENGTH) continue;
    const drawn = sanitizeMathMarkup(ml.convertLatexToMarkup(math));
    if (!drawn) continue;
    chip.setAttribute(MATH_PLAIN_ATTR, chip.textContent ?? '');
    chip.setAttribute('contenteditable', 'false');
    chip.innerHTML = drawn;
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
