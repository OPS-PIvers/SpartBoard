/** Standard codes a teacher typed or a test printed beside a question, e.g. "(MN 7.4.1.1)" or a leading "6.1.2.1". */

import type { StandardBenchmark } from '@/types';

/** `MN 9.4.2.1`, `9.4.2.1` and `9.4.2.1.` all normalize to `9.4.2.1`. */
export const normalizeStandardCode = (code: string): string =>
  code
    .trim()
    .replace(/^[A-Za-z]{2,4}\s+(?=\d)/, '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[.:;,]+$/, '');

const CODE = String.raw`(?:WL\.)?(?:K|\d{1,2})[A-Z]?(?:\.\d{1,2}[A-Z]?){2,4}`;
const PREFIX = String.raw`(?:(?:MN|Minnesota)\s+)?(?:(?:ELA|Math|Science|SS|Social\s+Studies)\s+)?`;
const ITEM = `${PREFIX}${CODE}`;
const LIST = String.raw`${ITEM}(?:\s*(?:,|;|&|\/|and)\s*${ITEM})*`;
const LABEL = String.raw`\b(?:standards?|benchmarks?|std\.?)\s*[:#-]?\s*`;

// Bracketed or labeled anywhere; bare only at the very start or end of the text.
const PATTERNS = [
  new RegExp(String.raw`\s*[([]\s*(?:${LABEL})?(${LIST})\s*[)\]]`, 'gi'),
  new RegExp(String.raw`\s*${LABEL}(${LIST})\.?`, 'gi'),
  new RegExp(String.raw`^\s*(${LIST})(?:\s*[:.)\-–—]\s*|\s+)`, 'gi'),
  new RegExp(String.raw`(?<=[\s?.!:;,])[\s\-–—]*(${LIST})\.?\s*$`, 'gi'),
];
const CODE_IN_LIST = new RegExp(CODE, 'gi');

export interface StandardRun {
  start: number;
  end: number;
  codes: string[];
}

/** Every run of standard codes in a recognised spot, in text order, never overlapping. */
export function findStandardRuns(text: string): StandardRun[] {
  const runs: StandardRun[] = [];
  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    for (const m of text.matchAll(pattern)) {
      const start = m.index;
      const end = start + m[0].length;
      if (runs.some((r) => start < r.end && end > r.start)) continue;
      const codes = m[1].match(CODE_IN_LIST) ?? [];
      if (codes.length > 0) runs.push({ start, end, codes });
    }
  }
  return runs.sort((a, b) => a.start - b.start);
}

/** The text with these runs cut out and the seams tidied. */
export function removeRuns(text: string, runs: readonly StandardRun[]): string {
  let out = '';
  let at = 0;
  for (const r of [...runs].sort((a, b) => a.start - b.start)) {
    out += text.slice(at, r.start);
    // Keep one space where a run sat between two words.
    if (/\S$/.test(out) && /^\S/.test(text.slice(r.end))) out += ' ';
    at = r.end;
  }
  out += text.slice(at);
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([?.!,;:])/g, '$1')
    .trim();
}

export interface TeachingProfile {
  /** Subject ids from config/subjects.ts. */
  subjects: readonly string[];
  /** 'K', '1' … '12'. */
  grades: readonly string[];
}

const setYear = (set: string): number => Number(/(\d{4})$/.exec(set)?.[1] ?? 0);

const gradeCovers = (grade: string, taught: readonly string[]): boolean => {
  const band = /^(K|\d{1,2})-(\d{1,2})$/.exec(grade);
  if (!band) return taught.includes(grade);
  const lo = band[1] === 'K' ? 0 : Number(band[1]);
  const hi = Number(band[2]);
  return taught.some((g) => {
    const n = g === 'K' ? 0 : Number(g);
    return n >= lo && n <= hi;
  });
};

/** Narrows hits by keeping only those that pass, unless none would. */
const prefer = <T>(hits: T[], keep: (h: T) => boolean): T[] => {
  const kept = hits.filter(keep);
  return kept.length > 0 ? kept : hits;
};

/** The one benchmark a code names, using the teacher's subjects and grades, then the newest set, to break a tie. */
export function resolveStandardCode(
  code: string,
  byCode: ReadonlyMap<string, readonly StandardBenchmark[]>,
  profile?: TeachingProfile
): StandardBenchmark | null {
  let hits = [...(byCode.get(normalizeStandardCode(code)) ?? [])];
  if (hits.length > 1 && profile) {
    if (profile.subjects.length > 0)
      hits = prefer(hits, (h) => profile.subjects.includes(h.subject));
    if (profile.grades.length > 0)
      hits = prefer(hits, (h) => gradeCovers(h.grade, profile.grades));
    if (new Set(hits.map((h) => h.subject)).size === 1) {
      const newest = Math.max(...hits.map((h) => setYear(h.set)));
      hits = hits.filter((h) => setYear(h.set) === newest);
    }
  }
  return hits.length === 1 ? hits[0] : null;
}

export const indexByCode = (
  benchmarks: readonly StandardBenchmark[]
): Map<string, StandardBenchmark[]> => {
  const byCode = new Map<string, StandardBenchmark[]>();
  for (const b of benchmarks) {
    const key = normalizeStandardCode(b.code);
    byCode.set(key, [...(byCode.get(key) ?? []), b]);
  }
  return byCode;
};

export interface TextStandards {
  /** The text without the runs whose every code resolved. */
  text: string;
  matched: StandardBenchmark[];
}

/** Resolves the codes in `text`; a run is cut only when all its codes resolve, so nothing is lost. */
export function takeStandardsFromText(
  text: string,
  byCode: ReadonlyMap<string, readonly StandardBenchmark[]>,
  profile?: TeachingProfile
): TextStandards {
  const matched: StandardBenchmark[] = [];
  const cut: StandardRun[] = [];
  for (const run of findStandardRuns(text)) {
    const hits = run.codes.map((c) => resolveStandardCode(c, byCode, profile));
    if (hits.some((h) => h === null)) continue;
    cut.push(run);
    for (const h of hits as StandardBenchmark[])
      if (!matched.includes(h)) matched.push(h);
  }
  return {
    text: cut.length > 0 ? removeRuns(text, cut) : text,
    matched,
  };
}
