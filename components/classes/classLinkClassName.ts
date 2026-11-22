import type { ClassLinkClass } from '@/types';
import { readClassPeriods } from './classLinkPeriods';

export type ClassNameStyle =
  'course-period' | 'period-course' | 'course-term-period';

export interface ParsedClassTitle {
  term?: string;
  course: string;
  period?: string;
}

const TERM_RE = /^\(\s*([A-Z]{1,3}\d{0,2})\s*\)\s*/i;
const TRAILING_PERIOD_RE = /\s*\(\s*([A-Z0-9]{1,4})\s*\)\s*$/i;
// "Erickson, T /Frie/Ivers/Nohner " or "Ivers, J ": last name, initial, optional /co-teachers.
const TEACHERS_RE =
  /^[A-Z][A-Za-z'’-]*(?:\s[A-Z][A-Za-z'’-]*)?,\s*[A-Z]\.?(?:\s*\/\s*[A-Z][A-Za-z'’-]*)*\s+/;
const ROMAN_RE = /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X)$/;
const KEEP_UPPER = new Set([
  'AP',
  'IB',
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
  if (teachersMatch) rest = rest.slice(teachersMatch[0].length);
  const course = rest.replace(/\s+/g, ' ').trim();
  if (!course || (!termMatch && !teachersMatch)) return null;
  const period =
    periodMatch?.[1] ?? (periods.length > 0 ? periods.join(', ') : undefined);
  return { term, course: tidyCourseCase(course), period };
};

/** A short, readable roster name for a ClassLink class, or null when the title doesn't look like an SIS title. */
export const cleanClassLinkName = (
  cls: Pick<ClassLinkClass, 'title' | 'periods'>,
  style: ClassNameStyle = 'course-term-period'
): string | null => {
  const parsed = parseClassTitle(
    cls.title,
    readClassPeriods(cls as ClassLinkClass)
  );
  if (!parsed) return null;
  const { term, course, period } = parsed;
  if (style === 'period-course')
    return period ? `P${period} ${course}` : course;
  if (style === 'course-term-period') {
    const tags = [term, period ? `P${period}` : undefined].filter(Boolean);
    return tags.length > 0 ? `${course} (${tags.join(', ')})` : course;
  }
  return period ? `${course}, Period ${period}` : course;
};

/** Clean names keyed by sourcedId; repeated names get their class code so sections stay distinct. */
export const buildCleanClassNames = (
  classes: readonly ClassLinkClass[],
  style: ClassNameStyle = 'course-term-period'
): Map<string, string> => {
  const names = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const cls of classes) {
    if (cls.sourcedId.startsWith('test:')) continue;
    const name = cleanClassLinkName(cls, style);
    if (!name || name === cls.title) continue;
    names.set(cls.sourcedId, name);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  for (const cls of classes) {
    const name = names.get(cls.sourcedId);
    if (name && (counts.get(name) ?? 0) > 1 && cls.classCode)
      names.set(cls.sourcedId, `${name} (${cls.classCode})`);
  }
  return names;
};
