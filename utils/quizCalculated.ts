// Random-number questions: safe formula parsing, per-student number draws and tolerance grading. Mirrored in functions/src/quizCalculated.ts.

import type { CalcSpec, CalcTolerance, CalcVariable } from '@/types';

export type { CalcSpec, CalcTolerance, CalcVariable } from '@/types';

export const CALC_MAX_VARIABLES = 8;
export const CALC_MAX_DECIMALS = 6;
const MAX_FORMULA_LENGTH = 300;
const VAR_NAME = /^[a-zA-Z][0-9]?$/;

type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'neg'; a: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { t: 'fn'; name: FnName; a: Node };

const FUNCTIONS = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
} as const;
type FnName = keyof typeof FUNCTIONS;
const CONSTANTS: Record<string, number> = { pi: Math.PI, π: Math.PI };

type Token =
  { k: 'num'; v: number } | { k: 'id'; v: string } | { k: 'op'; v: string };

function tokenize(src: string): Token[] {
  const s = src
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/[{}]/g, ' ');
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
      if (!m) throw new Error('bad number');
      out.push({ k: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if (/[a-zA-Zπ]/.test(c)) {
      const m = /^(π|[a-zA-Z]+[0-9]*)/.exec(s.slice(i));
      if (!m) throw new Error('bad name');
      const word = m[0];
      // Functions and pi stay whole; other letters are one-letter names multiplied (mv = m v).
      if (
        word === 'π' ||
        Object.hasOwn(FUNCTIONS, word.toLowerCase()) ||
        word.toLowerCase() === 'pi'
      ) {
        out.push({ k: 'id', v: word });
      } else {
        for (const part of word.match(/[a-zA-Z][0-9]*/g) ?? [])
          out.push({ k: 'id', v: part });
      }
      i += word.length;
    } else if ('+-*/^()'.includes(c)) {
      out.push({ k: 'op', v: c });
      i++;
    } else {
      throw new Error(`unexpected ${c}`);
    }
  }
  return out;
}

/** Parses a teacher formula; throws on anything but numbers, names, + - * / ^, brackets and the listed functions. */
export function parseFormula(src: string): Node {
  if (src.length > MAX_FORMULA_LENGTH) throw new Error('too long');
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => {
    const t = toks[p];
    return t?.k === 'op' && t.v === v;
  };
  const expr = (): Node => {
    let a = term();
    while (isOp('+') || isOp('-')) {
      const op = (toks[p++] as { v: '+' | '-' }).v;
      a = { t: 'bin', op, a, b: term() };
    }
    return a;
  };
  const startsFactor = () => {
    const t = peek();
    return !!t && (t.k !== 'op' || t.v === '(');
  };
  const term = (): Node => {
    let a = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = (toks[p++] as { v: '*' | '/' }).v;
        a = { t: 'bin', op, a, b: unary() };
      } else if (startsFactor()) {
        // Implied multiplication: 2d, 3(a+b), (a)(b).
        a = { t: 'bin', op: '*', a, b: power() };
      } else return a;
    }
  };
  const unary = (): Node => {
    if (isOp('-')) {
      p++;
      return { t: 'neg', a: unary() };
    }
    if (isOp('+')) {
      p++;
      return unary();
    }
    return power();
  };
  const power = (): Node => {
    const base = atom();
    if (isOp('^')) {
      p++;
      return { t: 'bin', op: '^', a: base, b: unary() };
    }
    return base;
  };
  const atom = (): Node => {
    const t = toks[p++];
    if (!t) throw new Error('unexpected end');
    if (t.k === 'num') return { t: 'num', v: t.v };
    if (t.k === 'op' && t.v === '(') {
      const e = expr();
      if (!isOp(')')) throw new Error('missing )');
      p++;
      return e;
    }
    if (t.k === 'id') {
      const lower = t.v.toLowerCase();
      if (Object.hasOwn(FUNCTIONS, lower)) {
        if (!isOp('(')) throw new Error('function needs (');
        return { t: 'fn', name: lower as FnName, a: atom() };
      }
      if (t.v in CONSTANTS) return { t: 'num', v: CONSTANTS[t.v] };
      if (lower === 'pi') return { t: 'num', v: Math.PI };
      return { t: 'var', name: t.v };
    }
    throw new Error(`unexpected ${t.v}`);
  };
  const tree = expr();
  if (p !== toks.length) throw new Error('unexpected input');
  return tree;
}

/** Variable names a formula uses, in first-seen order. */
export function formulaVariables(src: string): string[] {
  const seen: string[] = [];
  const walk = (n: Node) => {
    if (n.t === 'var' && !seen.includes(n.name)) seen.push(n.name);
    if (n.t === 'neg' || n.t === 'fn') walk(n.a);
    if (n.t === 'bin') {
      walk(n.a);
      walk(n.b);
    }
  };
  walk(parseFormula(src));
  return seen;
}

function evalNode(n: Node, values: Record<string, number>): number {
  switch (n.t) {
    case 'num':
      return n.v;
    case 'var': {
      const v = values[n.name];
      if (typeof v !== 'number') throw new Error(`unknown ${n.name}`);
      return v;
    }
    case 'neg':
      return -evalNode(n.a, values);
    case 'fn':
      return FUNCTIONS[n.name](evalNode(n.a, values));
    case 'bin': {
      const a = evalNode(n.a, values);
      const b = evalNode(n.b, values);
      if (n.op === '+') return a + b;
      if (n.op === '-') return a - b;
      if (n.op === '*') return a * b;
      if (n.op === '/') return a / b;
      return Math.pow(a, b);
    }
  }
}

/** The formula's value for these numbers, or null when it can't be computed (bad formula, divide by zero). */
export function evaluateFormula(
  src: string,
  values: Record<string, number>
): number | null {
  try {
    const v = evalNode(parseFormula(src), values);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

// FNV-1a then mulberry32: the same seed always gives the same numbers, on any device.
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isValidVariable(v: CalcVariable): boolean {
  return (
    VAR_NAME.test(v.name) &&
    Number.isFinite(v.min) &&
    Number.isFinite(v.max) &&
    v.min <= v.max &&
    Number.isInteger(v.decimals) &&
    v.decimals >= 0 &&
    v.decimals <= CALC_MAX_DECIMALS
  );
}

/** One variable's value: uniform over the range's steps at its decimals, both ends included. */
function drawOne(v: CalcVariable, rand: () => number): number {
  const scale = 10 ** v.decimals;
  const lo = Math.ceil(v.min * scale - 1e-9);
  const hi = Math.floor(v.max * scale + 1e-9);
  if (hi <= lo) return lo / scale;
  const step = lo + Math.floor(rand() * (hi - lo + 1));
  return Number((step / scale).toFixed(v.decimals));
}

/**
 * A student's numbers for one question, from the session id, the student's key and the question id.
 * Uses only the ranges, so students and the server get the same numbers. Never draws 0 unless the range is only 0.
 */
export function drawCalcValues(
  spec: Pick<CalcSpec, 'variables'>,
  seed: string
): Record<string, number> {
  const rand = mulberry32(hash32(seed));
  const values: Record<string, number> = {};
  for (const v of spec.variables) {
    let n = drawOne(v, rand);
    for (let i = 0; n === 0 && i < 20; i++) n = drawOne(v, rand);
    values[v.name] = n;
  }
  return values;
}

export const calcSeed = (
  questionSeed: string,
  responseKey: string,
  questionId: string
): string => `${questionSeed}|${responseKey}|${questionId}`;

/** Reads a typed number: commas as thousands, a leading +, scientific notation, simple fractions, and the unit if typed. */
export function parseStudentNumber(raw: string, unit?: string): number | null {
  let s = raw.trim().replace(/[−–]/g, '-');
  if (unit) {
    const u = unit.trim();
    if (u && s.toLowerCase().endsWith(u.toLowerCase())) {
      s = s.slice(0, s.length - u.length).trim();
    }
  }
  s = s.replace(/(\d),(?=\d{3}\b)/g, '$1').replace(/\s+/g, '');
  if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return Number(s);
  const sci = /^([+-]?(?:\d+\.?\d*|\.\d+))[x*×·]10\^\(?([+-]?\d+)\)?$/i.exec(s);
  if (sci) return Number(sci[1]) * 10 ** Number(sci[2]);
  const frac = /^([+-]?\d+)\/(\d+)$/.exec(s);
  if (frac && Number(frac[2]) !== 0) return Number(frac[1]) / Number(frac[2]);
  return null;
}

/** True when the typed answer is within the question's tolerance of the exact answer. */
export function calcAnswerAccepted(
  spec: CalcSpec,
  values: Record<string, number>,
  studentAnswer: string
): boolean {
  const expected = evaluateFormula(spec.formula, values);
  const given = parseStudentNumber(studentAnswer, spec.unit);
  if (expected === null || given === null) return false;
  const diff = Math.abs(given - expected);
  // A hair of slack so an answer typed at the shown rounding is never refused by float noise.
  const eps = 1e-9 * Math.max(1, Math.abs(expected));
  const shownSlack = 0.5 * 10 ** -calcRoundTo(spec) + eps;
  const allowed =
    spec.tolerance.kind === 'relative'
      ? (Math.abs(expected) * Math.max(0, spec.tolerance.percent)) / 100
      : Math.max(0, spec.tolerance.amount);
  return diff <= Math.max(allowed, shownSlack) + eps;
}

/** Decimals the answer is rounded to; 2 when the teacher never set it, as the editor shows. */
export const calcRoundTo = (spec: Pick<CalcSpec, 'roundTo'>): number =>
  spec.roundTo ?? 2;

/** The answer as shown to teachers and in reveals, rounded to the question's decimals. */
export function formatCalcAnswer(
  spec: CalcSpec,
  values: Record<string, number>
): string {
  const v = evaluateFormula(spec.formula, values);
  if (v === null) return '';
  const text = v.toFixed(calcRoundTo(spec));
  return spec.unit ? `${text} ${spec.unit}` : text;
}

/** Puts a student's numbers into the prompt's {name} slots. */
export function fillCalcPrompt(
  text: string,
  spec: Pick<CalcSpec, 'variables'>,
  values: Record<string, number>
): string {
  const byName = new Map(spec.variables.map((v) => [v.name, v]));
  return text.replace(/\{([a-zA-Z][0-9]?)\}/g, (whole, name: string) => {
    const v = byName.get(name);
    const n = values[name];
    return v && typeof n === 'number' ? n.toFixed(v.decimals) : whole;
  });
}

/** True when a question is a random-number question with a usable formula. */
export function isCalcQuestion(q: { type: string; calc?: CalcSpec }): boolean {
  return q.type === 'FIB' && !!q.calc && q.calc.variables.length > 0;
}

/** The key one attempt's numbers come from: the response key, when it joined, and the attempt number after the first. */
export function calcAttemptKey(
  responseKey: string,
  response?: {
    status?: unknown;
    completedAttempts?: unknown;
    joinedAt?: unknown;
  } | null
): string {
  const done =
    typeof response?.completedAttempts === 'number'
      ? response.completedAttempts
      : 0;
  const attempt =
    response?.status === 'completed' ? Math.max(1, done) : done + 1;
  // A new assignment is a new join, so the same student gets new numbers.
  const joined =
    typeof response?.joinedAt === 'number' && Number.isFinite(response.joinedAt)
      ? `@${response.joinedAt}`
      : '';
  return attempt > 1
    ? `${responseKey}${joined}#${attempt}`
    : `${responseKey}${joined}`;
}

/** One student's numbers for a question, from the question's seed and their response key. */
export function calcValuesFor(
  q: { id: string; calc?: Pick<CalcSpec, 'variables' | 'seed'> },
  responseKey: string
): Record<string, number> | undefined {
  if (!q.calc || q.calc.variables.length === 0) return undefined;
  return drawCalcValues(q.calc, calcSeed(q.calc.seed, responseKey, q.id));
}

/** The question as graded for one student: their numbers attached. Other questions come back unchanged. */
export function withCalcValues<
  Q extends { id: string; type: string; calc?: CalcSpec },
>(
  q: Q,
  responseKey: string | undefined,
  /** The student gets the modified version; its typed-number answer grades them when set. */
  modified = false
): Q & { calcValues?: Record<string, number> } {
  if (!isCalcQuestion(q) || !responseKey || !q.calc) return q;
  const fixed = modified ? calcModifiedValue(q.calc) : null;
  if (fixed !== null)
    return {
      ...q,
      calc: { ...q.calc, formula: fixedFormula(fixed) },
      calcValues: {},
    };
  return { ...q, calcValues: calcValuesFor(q, responseKey) };
}

/** True when a modified prompt uses none of the question's numbers, so it needs its own answer. */
export function calcModifiedNeedsAnswer(
  modifiedText: string | undefined,
  spec: Pick<CalcSpec, 'variables'>
): boolean {
  if (!modifiedText?.trim()) return false;
  const names = new Set(spec.variables.map((v) => v.name));
  for (const m of modifiedText.matchAll(/\{([a-zA-Z][0-9]?)\}/g))
    if (names.has(m[1])) return false;
  return true;
}

/** The modified version's typed answer as a number, or null when it has none. */
export function calcModifiedValue(
  spec: Pick<CalcSpec, 'modifiedAnswer' | 'unit'>
): number | null {
  return spec.modifiedAnswer
    ? parseStudentNumber(spec.modifiedAnswer, spec.unit)
    : null;
}

const fixedFormula = (n: number): string =>
  /e/i.test(String(n)) ? n.toFixed(CALC_MAX_DECIMALS * 2) : String(n);

const asObj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;

/** Reads a stored random-number spec; undefined unless it has a seed, a formula and valid numbers. */
export function parseCalcSpec(raw: unknown): CalcSpec | undefined {
  const r = asObj(raw);
  if (!r || typeof r.seed !== 'string' || typeof r.formula !== 'string')
    return undefined;
  const variables: CalcVariable[] = [];
  for (const entry of Array.isArray(r.variables) ? r.variables : []) {
    const e = asObj(entry);
    if (!e) continue;
    const v = {
      name: typeof e.name === 'string' ? e.name : '',
      min: Number(e.min),
      max: Number(e.max),
      decimals: Number(e.decimals),
    };
    if (isValidVariable(v) && !variables.some((x) => x.name === v.name))
      variables.push(v);
  }
  if (variables.length === 0 || variables.length > CALC_MAX_VARIABLES)
    return undefined;
  const t = asObj(r.tolerance);
  const tolerance: CalcTolerance =
    t?.kind === 'absolute' && Number.isFinite(Number(t.amount))
      ? { kind: 'absolute', amount: Math.max(0, Number(t.amount)) }
      : {
          kind: 'relative',
          percent:
            t && Number.isFinite(Number(t.percent))
              ? Math.max(0, Number(t.percent))
              : 1,
        };
  const roundTo = Number(r.roundTo);
  return {
    seed: r.seed,
    variables,
    formula: r.formula,
    tolerance,
    ...(Number.isInteger(roundTo) &&
    roundTo >= 0 &&
    roundTo <= CALC_MAX_DECIMALS
      ? { roundTo }
      : {}),
    ...(typeof r.unit === 'string' && r.unit.trim()
      ? { unit: r.unit.trim() }
      : {}),
    ...(typeof r.modifiedAnswer === 'string' && r.modifiedAnswer.trim()
      ? { modifiedAnswer: r.modifiedAnswer.trim().slice(0, 40) }
      : {}),
  };
}
