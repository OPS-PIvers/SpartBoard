import type { ClassLinkClass } from '@/types';
import { readClassPeriods } from './classLinkPeriods';

export interface ParsedClassTitle {
  term?: string;
  course: string;
  periods: string[];
}

const TERM_RE = /^\(\s*([A-Z]{1,3}\d{0,2})\s*\)\s*/i;
const TRAILING_PERIOD_RE = /\s*\(\s*(\d{1,2}[A-Z]?)\s*\)\s*$/i;
// A name word has a lowercase letter, so all-caps course text like "CHOIR, A" is never read as a teacher.
const NAME = "[A-Z][A-Za-z'’-]*[a-z][A-Za-z'’-]*";
const GIVEN = `(?:[A-Z]\\.?|${NAME})`;
// "Erickson, T /Frie/Ivers/Nohner " or "De La Cruz, K ": surname, initial, optional /co-teachers.
const TEACHERS_RE = new RegExp(
  `^${NAME}(?:\\s${NAME}){0,2},\\s*${GIVEN}(?:\\s*\\/\\s*${NAME}(?:,\\s*${GIVEN})?)*(?:\\s+|$)`
);
const ROMAN_RE = /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X)$/;
const ORDINAL_RE = /^(\d+)(ST|ND|RD|TH)$/;
const KEEP_UPPER = new Set([
  'AP',
  'IB',
  'HL',
  'SL',
  'CIS',
  'PE',
  'ELL',
  'EL',
  'ESL',
  'STEM',
  'US',
  'USA',
  'CTE',
  'PLTW',
  'ACT',
  'SAT',
  'ADV',
  'DNA',
  'AVID',
  'JROTC',
  'TV',
  'ROTC',
  'ELA',
]);
const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'for',
  'of',
  'the',
  'to',
  'in',
  'on',
  'or',
  'with',
]);

const titleWord = (word: string, isFirst: boolean): string => {
  if (!/[A-Z]/.test(word)) return word;
  const ordinal = ORDINAL_RE.exec(word);
  if (ordinal) return `${ordinal[1]}${ordinal[2].toLowerCase()}`;
  if (ROMAN_RE.test(word) || KEEP_UPPER.has(word) || /\d/.test(word))
    return word;
  if (word.length === 1) return word;
  const lower = word.toLowerCase();
  if (!isFirst && SMALL_WORDS.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

/** Title-cases an all-caps SIS course name; leaves mixed-case names alone. */
export const tidyCourseCase = (course: string): string => {
  if (/[a-z]/.test(course)) return course;
  let first = true;
  return course.replace(/[A-Za-z0-9'’.]+/g, (word) => {
    const out = titleWord(word, first);
    first = false;
    return out;
  });
};

/** Splits an SIS class title like "(S1) Erickson, T /Frie ENGLISH I A(2)" into term, course and period. */
export const parseClassTitle = (
  title: string,
  periods: readonly string[] = []
): ParsedClassTitle | null => {
  let rest = title.trim();
  const termMatch = TERM_RE.exec(rest);
  const term = termMatch?.[1]?.toUpperCase();
  if (termMatch) rest = rest.slice(termMatch[0].length);
  const periodMatch = TRAILING_PERIOD_RE.exec(rest);
  if (periodMatch) rest = rest.slice(0, periodMatch.index);
  const teachersMatch = TEACHERS_RE.exec(rest);
  if (!teachersMatch) return null;
  const course = rest
    .slice(teachersMatch[0].length)
    .replace(/\s+/g, ' ')
    .trim();
  if (!course || /[,/]/.test(course)) return null;
  return {
    term,
    course: tidyCourseCase(course),
    periods: periodMatch ? [periodMatch[1]] : [...periods],
  };
};

/** A short roster name like "English I A (P2)", or null when the title doesn't look like an SIS title. */
export const cleanClassLinkName = (
  cls: Pick<ClassLinkClass, 'title' | 'periods'>
): string | null => {
  const parsed = parseClassTitle(
    cls.title,
    readClassPeriods(cls as ClassLinkClass)
  );
  if (!parsed) return null;
  const { course, periods } = parsed;
  return periods.length > 0
    ? `${course} (${periods.map((p) => `P${p}`).join(', ')})`
    : course;
};

const countNames = (names: Map<string, string>): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const name of names.values())
    counts.set(name, (counts.get(name) ?? 0) + 1);
  return counts;
};

/** Clean names keyed by sourcedId; repeats get their class code, and any still repeated keep the full title. */
export const buildCleanClassNames = (
  classes: readonly ClassLinkClass[]
): Map<string, string> => {
  const names = new Map<string, string>();
  for (const cls of classes) {
    if (cls.sourcedId.startsWith('test:')) continue;
    const name = cleanClassLinkName(cls);
    if (name && name !== cls.title) names.set(cls.sourcedId, name);
  }
  const counts = countNames(names);
  for (const cls of classes) {
    const name = names.get(cls.sourcedId);
    if (name && (counts.get(name) ?? 0) > 1 && cls.classCode)
      names.set(cls.sourcedId, `${name} (${cls.classCode})`);
  }
  const finalCounts = countNames(names);
  for (const [id, name] of [...names])
    if ((finalCounts.get(name) ?? 0) > 1) names.delete(id);
  return names;
};
