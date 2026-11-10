/**
 * Math written out as plain text, which is all a quiz question holds: `x²`,
 * `H₂O`, `(x + 1)/(2x − 5)`, `√(x + 1)`. Shared by the PDF and Word readers.
 */

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '−': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  a: 'ᵃ',
  b: 'ᵇ',
  c: 'ᶜ',
  d: 'ᵈ',
  e: 'ᵉ',
  f: 'ᶠ',
  g: 'ᵍ',
  h: 'ʰ',
  i: 'ⁱ',
  j: 'ʲ',
  k: 'ᵏ',
  l: 'ˡ',
  m: 'ᵐ',
  n: 'ⁿ',
  o: 'ᵒ',
  p: 'ᵖ',
  r: 'ʳ',
  s: 'ˢ',
  t: 'ᵗ',
  u: 'ᵘ',
  v: 'ᵛ',
  w: 'ʷ',
  x: 'ˣ',
  y: 'ʸ',
  z: 'ᶻ',
};

const SUBSCRIPT: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '−': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
  a: 'ₐ',
  e: 'ₑ',
  h: 'ₕ',
  i: 'ᵢ',
  j: 'ⱼ',
  k: 'ₖ',
  l: 'ₗ',
  m: 'ₘ',
  n: 'ₙ',
  o: 'ₒ',
  p: 'ₚ',
  r: 'ᵣ',
  s: 'ₛ',
  t: 'ₜ',
  u: 'ᵤ',
  v: 'ᵥ',
  x: 'ₓ',
};

const tidy = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** The Symbol font's letters, a–z then A–Z, which are Greek. */
const SYMBOL_LOWER = 'αβχδεφγηιϕκλμνοπθρστυϖωξψζ';
const SYMBOL_UPPER = 'ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ';
/** The Symbol font's signs above ASCII, by its own character code. */
const SYMBOL_SIGNS: Record<number, string> = {
  0x2d: '−',
  0x2a: '∗',
  0xa3: '≤',
  0xa5: '∞',
  0xae: '→',
  0xb0: '°',
  0xb1: '±',
  0xb3: '≥',
  0xb4: '×',
  0xb5: '∝',
  0xb8: '÷',
  0xb9: '≠',
  0xba: '≡',
  0xbb: '≈',
  0xc7: '∩',
  0xc8: '∪',
  0xce: '∈',
  0xd0: '∠',
  0xd6: '√',
  0xd7: '⋅',
  0xde: '⇒',
  0xe5: '∑',
  0xf2: '∫',
};

/** Equation editors set `+`, `−`, `≠` and Greek in the Symbol font, which a PDF reports as private-use characters. */
export function symbolFontText(text: string): string {
  return text.replace(/[-]/g, (c) => {
    const code = c.charCodeAt(0) - 0xf000;
    const sign = SYMBOL_SIGNS[code];
    if (sign) return sign;
    if (code >= 0x61 && code <= 0x7a) return SYMBOL_LOWER[code - 0x61];
    if (code >= 0x41 && code <= 0x5a) return SYMBOL_UPPER[code - 0x41];
    return code >= 0x20 && code <= 0x7e ? String.fromCharCode(code) : c;
  });
}

/** One number, variable or word, which needs no brackets to stay together. */
const isAtom = (s: string): boolean => /^[-−]?[\p{L}\p{N}.°%]+$/u.test(s);

/** Already held together by one pair of brackets around all of it. */
function isBracketed(s: string): boolean {
  if (s[0] !== '(' && s[0] !== '[') return false;
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '(' || s[i] === '[') depth += 1;
    else if (s[i] === ')' || s[i] === ']') {
      depth -= 1;
      if (depth === 0) return i === s.length - 1;
    }
  }
  return false;
}

/** `text` in brackets unless it is a single term. */
export function grouped(text: string): string {
  const t = tidy(text);
  return isAtom(t) || isBracketed(t) ? t : `(${t})`;
}

/** Raised or lowered text: `x²`, `H₂O`, `xⁿ⁺¹`; `x^(AB)` when Unicode has no such letters. */
export function toScript(text: string, kind: 'sub' | 'sup'): string {
  const t = tidy(text).replace(/\s+/g, '');
  if (!t) return '';
  const table = kind === 'sub' ? SUBSCRIPT : SUPERSCRIPT;
  const chars = [...t];
  if (chars.every((c) => table[c] !== undefined)) {
    return chars.map((c) => table[c]).join('');
  }
  const mark = kind === 'sub' ? '_' : '^';
  return `${mark}${chars.length === 1 ? t : `(${tidy(text)})`}`;
}

const ORDINAL = /^(?:st|nd|rd|th)$/i;

/** Reads as an exponent or subscript: digits and signs, or a short term like `n`, `2x`, `n+1`; never `1st`'s `st`. */
export function isScriptRun(text: string): boolean {
  const t = text.trim();
  if (/^(?=.*\d)[\d+\-−]+$/.test(t)) return true;
  return /^[-−+]?\d{0,2}[a-z](?:[+\-−]\d{1,2})?$/.test(t) && !ORDINAL.test(t);
}

/** A stacked fraction on one line: `2/3`, `(x + 1)/(2x − 5)`. */
export function fraction(numerator: string, denominator: string): string {
  return `${grouped(numerator)}/${grouped(denominator)}`;
}

const localName = (el: Element): string =>
  el.tagName.includes(':') ? el.tagName.split(':')[1] : el.tagName;

const child = (el: Element, name: string): Element | undefined =>
  Array.from(el.children).find((c) => localName(c) === name);

const attr = (el: Element | undefined, name: string): string | null =>
  el ? (el.getAttribute(`m:${name}`) ?? el.getAttribute(name)) : null;

/** A property like `<m:begChr m:val="["/>` from an element's `…Pr` child. */
function property(el: Element, props: string, name: string): string | null {
  const holder = child(el, props);
  const found = holder ? child(holder, name) : undefined;
  return found ? attr(found, 'val') : null;
}

const part = (el: Element, name: string): string => {
  const found = child(el, name);
  return found ? ommlText(found) : '';
};

const ROOTS: Record<string, string> = { '2': '√', '3': '∛', '4': '∜' };

/** After a function name or a big operator, a term stands alone and anything longer is bracketed. */
const applied = (name: string, arg: string): string => {
  const a = tidy(arg);
  if (!a) return name;
  return isAtom(a) ? `${name} ${a}` : `${name}${grouped(a)}`;
};

/**
 * A Word equation (`m:oMath`) as plain text. Fractions, powers, subscripts,
 * roots, brackets, sums and matrices keep their meaning; anything else reads
 * as its text in document order.
 */
export function ommlText(el: Element): string {
  let out = '';
  for (const c of Array.from(el.children)) {
    const name = localName(c);
    if (name.endsWith('Pr')) continue;
    if (name === 't') {
      out += c.textContent ?? '';
    } else if (name === 'f') {
      const num = part(c, 'num');
      const den = part(c, 'den');
      // Docs sets a word over an arrow as a fraction with nothing under it.
      if (!tidy(num) || !tidy(den)) out += num + den;
      else if (property(c, 'fPr', 'type') === 'noBar') {
        out += `(${tidy(num)} over ${tidy(den)})`;
      } else out += fraction(num, den);
    } else if (name === 'sSup') {
      out += part(c, 'e') + toScript(part(c, 'sup'), 'sup');
    } else if (name === 'sSub') {
      out += part(c, 'e') + toScript(part(c, 'sub'), 'sub');
    } else if (name === 'sSubSup') {
      out +=
        part(c, 'e') +
        toScript(part(c, 'sub'), 'sub') +
        toScript(part(c, 'sup'), 'sup');
    } else if (name === 'sPre') {
      out +=
        toScript(part(c, 'sup'), 'sup') +
        toScript(part(c, 'sub'), 'sub') +
        part(c, 'e');
    } else if (name === 'rad') {
      const degree = tidy(part(c, 'deg'));
      const hidden = property(c, 'radPr', 'degHide');
      const shown = hidden === '1' || hidden === 'on' ? '' : degree;
      const sign = ROOTS[shown || '2'] ?? `${toScript(shown, 'sup')}√`;
      out += sign + grouped(part(c, 'e'));
    } else if (name === 'd') {
      const open = property(c, 'dPr', 'begChr') ?? '(';
      const close = property(c, 'dPr', 'endChr') ?? ')';
      const between = property(c, 'dPr', 'sepChr') ?? '|';
      const inner = Array.from(c.children)
        .filter((e) => localName(e) === 'e')
        .map((e) => tidy(ommlText(e)))
        .join(` ${between} `);
      out += `${open}${inner}${close}`;
    } else if (name === 'nary') {
      const sign = property(c, 'naryPr', 'chr') ?? '∫';
      const from = tidy(part(c, 'sub'));
      const to = tidy(part(c, 'sup'));
      const limits =
        (from ? toScript(from, 'sub') : '') + (to ? toScript(to, 'sup') : '');
      out += ` ${applied(`${sign}${limits}`, part(c, 'e'))}`;
    } else if (name === 'func') {
      out += applied(tidy(part(c, 'fName')), part(c, 'e'));
    } else if (name === 'm') {
      const rows = Array.from(c.children)
        .filter((r) => localName(r) === 'mr')
        .map((r) =>
          Array.from(r.children)
            .filter((e) => localName(e) === 'e')
            .map((e) => tidy(ommlText(e)))
            .join(', ')
        );
      out += `[${rows.join('; ')}]`;
    } else if (name === 'eqArr') {
      out += Array.from(c.children)
        .filter((e) => localName(e) === 'e')
        .map((e) => tidy(ommlText(e)))
        .join('; ');
    } else {
      out += ommlText(c);
    }
  }
  return out;
}
