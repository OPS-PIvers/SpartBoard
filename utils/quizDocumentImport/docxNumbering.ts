/**
 * Word's automatic list numbering (docs/plans/shipped/QUIZ_IMPORT_RELIABILITY.md R24).
 *
 * A teacher-typed Word test gets its `1.` and `a.` from list formatting, not
 * from typed characters, so `word/document.xml` holds no number at all. This
 * renders the prefix Word would print from `numbering.xml` and `styles.xml`.
 */

interface Level {
  fmt: string;
  text: string;
  start: number;
}

interface NumDef {
  abstractId: string;
  /** Level → start override; a num with any override counts on its own. */
  overrides: Map<number, number>;
}

interface StyleNum {
  numId?: string;
  ilvl?: number;
  basedOn?: string;
}

const localName = (el: Element): string =>
  el.tagName.includes(':') ? el.tagName.split(':')[1] : el.tagName;

const attr = (el: Element | undefined, name: string): string | null =>
  el ? (el.getAttribute(`w:${name}`) ?? el.getAttribute(name)) : null;

const child = (el: Element, name: string): Element | undefined =>
  Array.from(el.children).find((c) => localName(c) === name);

const children = (el: Element, name: string): Element[] =>
  Array.from(el.children).filter((c) => localName(c) === name);

const intAttr = (el: Element | undefined, fallback: number): number => {
  const n = Number.parseInt(attr(el, 'val') ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

const ROMAN: Array<[number, string]> = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

function roman(n: number): string {
  let out = '';
  let left = n;
  for (const [value, digits] of ROMAN) {
    while (left >= value) {
      out += digits;
      left -= value;
    }
  }
  return out;
}

/** Word's letter lists run a…z, then aa…zz. */
function letters(n: number): string {
  if (n < 1) return '';
  const letter = String.fromCharCode(97 + ((n - 1) % 26));
  return letter.repeat(Math.floor((n - 1) / 26) + 1);
}

export function formatNumber(n: number, fmt: string): string {
  switch (fmt) {
    case 'lowerLetter':
      return letters(n);
    case 'upperLetter':
      return letters(n).toUpperCase();
    case 'lowerRoman':
      return roman(n);
    case 'upperRoman':
      return roman(n).toUpperCase();
    case 'decimalZero':
      return n < 10 ? `0${n}` : String(n);
    default:
      return String(n);
  }
}

/** Formats that print no number. */
const SILENT = new Set(['bullet', 'none']);

export interface NumberingSource {
  numberingXml?: string;
  stylesXml?: string;
}

export class DocxNumbering {
  private abstracts = new Map<string, Map<number, Level>>();
  private nums = new Map<string, NumDef>();
  private styles = new Map<string, StyleNum>();
  /** Running values per list, index = level. */
  private counters = new Map<string, Array<number | undefined>>();

  constructor({ numberingXml, stylesXml }: NumberingSource) {
    if (numberingXml) this.readNumbering(numberingXml);
    if (stylesXml) this.readStyles(stylesXml);
  }

  private readNumbering(xml: string): void {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const root = doc.documentElement;
    for (const abs of children(root, 'abstractNum')) {
      const id = attr(abs, 'abstractNumId');
      if (id === null) continue;
      const levels = new Map<number, Level>();
      for (const lvl of children(abs, 'lvl')) {
        const ilvl = Number.parseInt(attr(lvl, 'ilvl') ?? '0', 10);
        levels.set(ilvl, {
          fmt: attr(child(lvl, 'numFmt'), 'val') ?? 'decimal',
          text: attr(child(lvl, 'lvlText'), 'val') ?? '',
          start: intAttr(child(lvl, 'start'), 1),
        });
      }
      this.abstracts.set(id, levels);
    }
    for (const num of children(root, 'num')) {
      const id = attr(num, 'numId');
      const abstractId = attr(child(num, 'abstractNumId'), 'val');
      if (id === null || abstractId === null) continue;
      const overrides = new Map<number, number>();
      for (const o of children(num, 'lvlOverride')) {
        const start = child(o, 'startOverride');
        if (!start) continue;
        overrides.set(
          Number.parseInt(attr(o, 'ilvl') ?? '0', 10),
          intAttr(start, 1)
        );
      }
      this.nums.set(id, { abstractId, overrides });
    }
  }

  private readStyles(xml: string): void {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    for (const style of children(doc.documentElement, 'style')) {
      const id = attr(style, 'styleId');
      if (!id) continue;
      const pPr = child(style, 'pPr');
      const numPr = pPr ? child(pPr, 'numPr') : undefined;
      const numId = numPr ? attr(child(numPr, 'numId'), 'val') : null;
      const ilvlEl = numPr ? child(numPr, 'ilvl') : undefined;
      this.styles.set(id, {
        ...(numId !== null ? { numId } : {}),
        ...(ilvlEl ? { ilvl: intAttr(ilvlEl, 0) } : {}),
        ...(attr(child(style, 'basedOn'), 'val')
          ? { basedOn: attr(child(style, 'basedOn'), 'val') as string }
          : {}),
      });
    }
  }

  /** A style's list, following `basedOn` up the chain. */
  private styleNum(styleId: string | null): StyleNum {
    const seen = new Set<string>();
    let id = styleId;
    const found: StyleNum = {};
    while (id && !seen.has(id)) {
      seen.add(id);
      const style = this.styles.get(id);
      if (!style) break;
      if (found.numId === undefined && style.numId !== undefined)
        found.numId = style.numId;
      if (found.ilvl === undefined && style.ilvl !== undefined)
        found.ilvl = style.ilvl;
      id = style.basedOn ?? null;
    }
    return found;
  }

  /**
   * The prefix Word prints before this paragraph, or '' for none. Advances
   * the list's counter, so call it once per paragraph in document order.
   */
  prefixFor(paragraph: Element): string {
    const pPr = child(paragraph, 'pPr');
    const direct = pPr ? child(pPr, 'numPr') : undefined;
    const style = this.styleNum(pPr ? attr(child(pPr, 'pStyle'), 'val') : null);
    const directNumId = direct ? attr(child(direct, 'numId'), 'val') : null;
    const directIlvl = direct ? child(direct, 'ilvl') : undefined;
    const numId = directNumId ?? style.numId;
    if (!numId || numId === '0') return '';
    const ilvl = directIlvl ? intAttr(directIlvl, 0) : (style.ilvl ?? 0);

    const num = this.nums.get(numId);
    if (!num) return '';
    const levels = this.abstracts.get(num.abstractId);
    const level = levels?.get(ilvl);
    if (!levels || !level) return '';

    const startOf = (l: number): number =>
      num.overrides.get(l) ?? levels.get(l)?.start ?? 1;
    // Nums that share an abstract list continue it; an override restarts.
    const key =
      num.overrides.size > 0 ? `num:${numId}` : `abs:${num.abstractId}`;
    const counter = this.counters.get(key) ?? [];
    counter[ilvl] =
      counter[ilvl] === undefined ? startOf(ilvl) : counter[ilvl] + 1;
    for (let deeper = ilvl + 1; deeper < counter.length; deeper += 1) {
      counter[deeper] = undefined;
    }
    this.counters.set(key, counter);

    if (SILENT.has(level.fmt)) return '';
    return level.text
      .replace(/%([1-9])/g, (_m, digit: string) => {
        const l = Number(digit) - 1;
        const value = counter[l] ?? startOf(l);
        const fmt = levels.get(l)?.fmt ?? 'decimal';
        return SILENT.has(fmt) ? '' : formatNumber(value, fmt);
      })
      .trim();
  }
}
