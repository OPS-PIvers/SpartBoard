/** Finds math written out as plain text in a question and marks it as an equation the quiz draws. */
import { hasPromptMath, wrapPromptMath } from '@/utils/promptMath';
import { SUBSCRIPT, SUPERSCRIPT } from './mathText';

type Kind =
  | 'num'
  | 'var'
  | 'func'
  | 'op'
  | 'open'
  | 'close'
  | 'sup'
  | 'sub'
  | 'root'
  | 'slash'
  | 'caret'
  | 'under'
  | 'unit'
  | 'bar'
  | 'space'
  | 'stop';

interface Tok {
  kind: Kind;
  text: string;
  start: number;
  end: number;
}

/** How sure a run is math: `numeric` is a bare `3/4`, which is also how a date or "24/7" is typed. */
export type MathStrength = 'strong' | 'numeric';

interface MathRun {
  start: number;
  end: number;
  math: string;
  strength: MathStrength;
}

const plainOf = (table: Record<string, string>): Map<string, string> =>
  new Map(
    Object.entries(table).map(([plain, script]) => [
      script,
      plain === '−' ? '-' : plain,
    ])
  );
const SUP_PLAIN = plainOf(SUPERSCRIPT);
const SUB_PLAIN = plainOf(SUBSCRIPT);
const scriptRun = (table: Record<string, string>): RegExp =>
  new RegExp(`[${[...new Set(Object.values(table))].join('')}]+`, 'y');

const SPACE = /\s+/y;
const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/y;
const SUP_RUN = scriptRun(SUPERSCRIPT);
const SUB_RUN = scriptRun(SUBSCRIPT);
const SCRIPTS = [...Object.values(SUPERSCRIPT), ...Object.values(SUBSCRIPT)];
// Raised and lowered letters are letters to Unicode, so they are kept out of a word.
const LETTERS = new RegExp(`(?:(?![${SCRIPTS.join('')}])\\p{L})+`, 'uy');
const OPERATORS = '+-−–×÷·⋅*=≠≤≥<>±≈';
const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'log', 'ln']);
/** Two letters after a number that are a unit or an ordinal, never variables. */
const NOT_FACTORS = /^(?:st|nd|rd|th|cm|mm|km|kg|ml|mg|in|ft|lb|oz|hr|am|pm)$/i;

function tokenize(text: string): Tok[] {
  const toks: Tok[] = [];
  const take = (re: RegExp, at: number): string | null => {
    re.lastIndex = at;
    return re.exec(text)?.[0] ?? null;
  };
  let i = 0;
  while (i < text.length) {
    const push = (kind: Kind, body: string): void => {
      toks.push({ kind, text: body, start: i, end: i + body.length });
      i += body.length;
    };
    const prev = toks[toks.length - 1];
    const c = text[i];
    const space = take(SPACE, i);
    const number = space ? null : take(NUMBER, i);
    const letters = space || number ? null : take(LETTERS, i);
    const sup = take(SUP_RUN, i);
    const sub = take(SUB_RUN, i);
    if (space) push('space', space);
    else if (number) push('num', number);
    else if (letters) {
      const lower = letters.toLowerCase();
      if (FUNCTIONS.has(lower)) push('func', lower);
      else if (lower === 'sqrt') push('root', letters);
      else if (letters.length === 1 || lower === 'pi') push('var', letters);
      else if (
        prev?.kind === 'num' &&
        letters.length === 2 &&
        letters === lower &&
        !NOT_FACTORS.test(letters)
      )
        push('var', letters);
      else push('stop', letters);
    } else if (sup) push('sup', sup);
    else if (sub) push('sub', sub);
    else if (OPERATORS.includes(c)) push('op', c);
    else if (c === '(' || c === '[') push('open', c);
    else if (c === ')' || c === ']') push('close', c);
    else if (c === '/') push('slash', c);
    else if (c === '^') push('caret', c);
    else if (c === '√') push('root', c);
    else if (c === '%' || c === '°') push('unit', c);
    else if (c === '|') push('bar', c);
    else if (c === '_' && text[i - 1] !== '_' && text[i + 1] !== '_')
      push('under', c);
    else push('stop', c);
  }
  return toks;
}

const ENDS: ReadonlySet<Kind> = new Set([
  'num',
  'var',
  'close',
  'sup',
  'sub',
  'unit',
]);
const STARTS: ReadonlySet<Kind> = new Set([
  'num',
  'var',
  'open',
  'root',
  'func',
]);

/** `2 1/2`: a whole number, a space, then a fraction of two numbers. */
function isMixedNumber(toks: readonly Tok[], space: number): boolean {
  const before = toks[space - 2]?.kind;
  return (
    toks[space - 1]?.kind === 'num' &&
    toks[space + 1]?.kind === 'num' &&
    toks[space + 2]?.kind === 'slash' &&
    toks[space + 3]?.kind === 'num' &&
    (before === undefined || before === 'space' || before === 'op')
  );
}

/** Runs of math tokens: words end one, and so do two terms with only a space between them. */
function runsOf(toks: readonly Tok[]): Tok[][] {
  const runs: Tok[][] = [];
  let current: Tok[] = [];
  const close = (): void => {
    if (current.length > 0) runs.push(current);
    current = [];
  };
  toks.forEach((tok, i) => {
    if (tok.kind === 'stop') return close();
    const prev = toks[i - 1]?.kind;
    const next = toks[i + 1]?.kind;
    if (
      tok.kind === 'space' &&
      prev !== undefined &&
      next !== undefined &&
      ENDS.has(prev) &&
      STARTS.has(next) &&
      // `1/2 (x − 2)` and `(x − 2) (x + 4)` are products.
      !(next === 'open' && prev !== 'var') &&
      !isMixedNumber(toks, i)
    )
      return close();
    current.push(tok);
  });
  close();
  return runs;
}

/** Each bracket's partner by index; -1 for one with none. */
function bracketPairs(toks: readonly Tok[]): number[] {
  const pair = toks.map(() => -1);
  const stack: number[] = [];
  toks.forEach((tok, i) => {
    if (tok.kind === 'open') stack.push(i);
    else if (tok.kind === 'close') {
      const open = stack.pop();
      if (open !== undefined) {
        pair[open] = i;
        pair[i] = open;
      }
    }
  });
  return pair;
}

const isSign = (tok: Tok | undefined): boolean =>
  tok?.kind === 'op' && '-−±'.includes(tok.text);

const LEADING_JUNK: ReadonlySet<Kind> = new Set([
  'space',
  'close',
  'slash',
  'caret',
  'under',
  'sup',
  'sub',
  'unit',
]);
const TRAILING_JUNK: ReadonlySet<Kind> = new Set([
  'space',
  'op',
  'open',
  'slash',
  'caret',
  'under',
  'root',
  'func',
]);

/** The run without the sentence's own brackets and stray signs at its ends; null when brackets don't pair. */
function trimRun(run: readonly Tok[]): Tok[] | null {
  let toks = [...run];
  for (let before = -1; before !== toks.length;) {
    before = toks.length;
    const first = toks[0];
    const last = toks[toks.length - 1];
    if (!first || !last) return null;
    const pair = bracketPairs(toks);
    if (
      LEADING_JUNK.has(first.kind) ||
      (first.kind === 'op' &&
        !(isSign(first) && STARTS.has(toks[1]?.kind ?? 'stop'))) ||
      (first.kind === 'open' && pair[0] < 0)
    )
      toks = toks.slice(1);
    else if (
      TRAILING_JUNK.has(last.kind) ||
      (last.kind === 'close' && pair[toks.length - 1] < 0)
    )
      toks = toks.slice(0, -1);
  }
  if (toks.length === 0) return null;
  const pair = bracketPairs(toks);
  const unpaired = toks.some(
    (tok, i) => (tok.kind === 'open' || tok.kind === 'close') && pair[i] < 0
  );
  const bars = toks.filter((tok) => tok.kind === 'bar').length;
  return unpaired || bars % 2 === 1 ? null : toks;
}

const TERM: ReadonlySet<Kind> = new Set(['num', 'var', 'sup', 'sub', 'unit']);

/** Where the term that ends at `end` starts: `2x²`, `(x + 1)`, `√(x)`; -1 for none. */
function termStart(toks: readonly Tok[], pair: number[], end: number): number {
  let j = end;
  while (j >= 0) {
    const kind = toks[j].kind;
    if (kind === 'close') {
      j = pair[j] - 1;
      if (toks[j]?.kind === 'func' || toks[j]?.kind === 'root') j -= 1;
    } else if (TERM.has(kind) || kind === 'caret' || kind === 'under') j -= 1;
    else if (kind === 'root' && j < end) j -= 1;
    else break;
  }
  return j + 1 <= end ? j + 1 : -1;
}

/** Where the term that starts at `start` ends; -1 for none. */
function termEnd(toks: readonly Tok[], pair: number[], start: number): number {
  let j = start;
  while (j < toks.length) {
    const kind = toks[j].kind;
    if (kind === 'open') j = pair[j] + 1;
    else if (TERM.has(kind) || kind === 'func' || kind === 'root') j += 1;
    else if (kind === 'caret' || kind === 'under') {
      j += isSign(toks[j + 1]) ? 2 : 1;
    } else break;
  }
  const last = toks[j - 1]?.kind;
  if (j - 1 < start || last === 'func' || last === 'root') return -1;
  return j - 1;
}

const mark = (kind: 'open' | 'close'): Tok => ({
  kind,
  text: kind === 'open' ? '(' : ')',
  start: -1,
  end: -1,
});

const scriptText = (text: string, plain: Map<string, string>): string => {
  const body = [...text].map((c) => plain.get(c) ?? c).join('');
  return body.length === 1 ? body : `(${body})`;
};

function spell(toks: readonly Tok[]): string {
  return toks
    .map((tok) => {
      if (tok.kind === 'space') return ' ';
      if (tok.kind === 'root') return 'sqrt';
      if (tok.kind === 'sup') return `^${scriptText(tok.text, SUP_PLAIN)}`;
      if (tok.kind === 'sub') return `_${scriptText(tok.text, SUB_PLAIN)}`;
      if (tok.kind === 'open') return '(';
      if (tok.kind === 'close') return ')';
      if (tok.kind !== 'op') return tok.text;
      if (tok.text === '−' || tok.text === '–') return '-';
      return tok.text === '·' || tok.text === '⋅' ? '*' : tok.text;
    })
    .join('');
}

/** One run as the plain math the quiz's equation box writes, and how sure it is math; null to leave it as text. */
function readRun(
  run: readonly Tok[]
): { math: string; strength: MathStrength } | null {
  if (run.some((t) => '∛∜'.includes(t.text))) return null;
  if (!run.some((t) => t.kind === 'num' || t.kind === 'var')) return null;
  const pair = bracketPairs(run);
  const wraps: Array<[number, number]> = [];
  let strong = run.some(
    (t, i) =>
      t.kind === 'caret' ||
      t.kind === 'under' ||
      (t.kind === 'root' && run[i + 1]?.kind === 'open')
  );
  let numeric = false;
  let letterPairs = 0;
  for (let k = 0; k < run.length; k += 1) {
    if (run[k].kind !== 'slash') continue;
    const from = termStart(run, pair, k - 1);
    const to = termEnd(run, pair, k + 1);
    if (from < 0 || to < 0) return null;
    // `11/9/2026` and `a/b/c` are not one fraction.
    if (run[from - 1]?.kind === 'slash' || run[to + 1]?.kind === 'slash')
      return null;
    const sides: Array<[number, number]> = [
      [from, k - 1],
      [k + 1, to],
    ];
    const single = (kind: Kind): boolean =>
      sides.every(([a, b]) => a === b && run[a].kind === kind);
    if (single('num')) numeric = true;
    else if (single('var')) letterPairs += 1;
    else strong = true;
    for (const [a, b] of sides) {
      const whole = run[a].kind === 'open' && pair[a] === b;
      if (!whole && !(a === b && run[a].kind === 'num')) wraps.push([a, b]);
    }
  }
  // `a/b` alone is as likely "and/or" shorthand; beside more math it is a fraction.
  if (
    letterPairs > 0 &&
    run.filter((t) => !['space', 'open', 'close'].includes(t.kind)).length > 3
  )
    strong = true;
  if (!strong && (!numeric || letterPairs > 0)) return null;
  run.forEach((t, i) => {
    const next = run[i + 1];
    if (t.kind === 'root' && next && next.kind !== 'open')
      wraps.push([i + 1, i + 1]);
    if (t.kind === 'caret' && next?.kind === 'num' && next.text.length > 1)
      wraps.push([i + 1, i + 1]);
  });
  const opens = new Map<number, number>();
  const closes = new Map<number, number>();
  for (const [a, b] of wraps) {
    opens.set(a, (opens.get(a) ?? 0) + 1);
    closes.set(b, (closes.get(b) ?? 0) + 1);
  }
  const out = run.flatMap((t, i) => [
    ...Array.from({ length: opens.get(i) ?? 0 }, () => mark('open')),
    t,
    ...Array.from({ length: closes.get(i) ?? 0 }, () => mark('close')),
  ]);
  return {
    math: spell(out).replace(/\s+/g, ' ').trim(),
    strength: strong ? 'strong' : 'numeric',
  };
}

function findMath(text: string): MathRun[] {
  if (hasPromptMath(text)) return [];
  return runsOf(tokenize(text)).flatMap((raw) => {
    const run = trimRun(raw);
    const read = run ? readRun(run) : null;
    if (!run || !read) return [];
    return [{ start: run[0].start, end: run[run.length - 1].end, ...read }];
  });
}

/** The strongest sign of math in the text, or null when it has none. */
export function mathStrength(text: string): MathStrength | null {
  const runs = findMath(text);
  if (runs.some((r) => r.strength === 'strong')) return 'strong';
  return runs.length > 0 ? 'numeric' : null;
}

/** `text` with its fractions, powers and roots marked as equations; a bare `3/4` only with `numericFractions`. */
export function markMath(
  text: string,
  options: { numericFractions?: boolean } = {}
): string {
  let out = '';
  let last = 0;
  for (const run of findMath(text)) {
    if (run.strength === 'numeric' && !options.numericFractions) continue;
    out += text.slice(last, run.start) + wrapPromptMath(run.math);
    last = run.end;
  }
  return out + text.slice(last);
}

/** How many texts with a bare `3/4` make a test a math test with no other sign of it. */
const NUMERIC_TEXTS = 3;

/** A marker for one test: bare number fractions are equations only when the test's `texts` show it is math. */
export function mathMarker(texts: readonly string[]): (text: string) => string {
  const found = texts.map(mathStrength);
  const numericFractions =
    found.includes('strong') ||
    found.filter((s) => s === 'numeric').length >= NUMERIC_TEXTS;
  return (text) => markMath(text, { numericFractions });
}
