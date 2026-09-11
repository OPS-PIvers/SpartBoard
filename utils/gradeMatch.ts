import type { GradeLevel } from '@/types';

/** Individual grades in display order. */
export const ALL_GRADES: readonly string[] = [
  'K',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
];

const GRADE_INDEX = new Map(ALL_GRADES.map((g, i) => [g, i]));

const BAND_GRADES: Record<GradeLevel, readonly string[]> = {
  'k-2': ['K', '1', '2'],
  '3-5': ['3', '4', '5'],
  '6-8': ['6', '7', '8'],
  '9-12': ['9', '10', '11', '12'],
};

export const isGrade = (value: unknown): value is string =>
  typeof value === 'string' && GRADE_INDEX.has(value);

/** Normalizes 'k', ' 10 ', '0' style inputs to canonical grades; drops junk and duplicates. */
export function normalizeGrades(values: readonly unknown[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    const canonical =
      trimmed.toUpperCase() === 'K' || trimmed === '0' ? 'K' : trimmed;
    if (isGrade(canonical)) out.add(canonical);
  }
  return sortGrades([...out]);
}

export const sortGrades = (grades: readonly string[]): string[] =>
  [...grades].sort(
    (a, b) => (GRADE_INDEX.get(a) ?? 99) - (GRADE_INDEX.get(b) ?? 99)
  );

/** Expands a catalog grade ('K', '7', '9-12', '11-12') to individual grades. */
export function expandGrade(catalogGrade: string): string[] {
  const value = catalogGrade.trim().toUpperCase();
  if (GRADE_INDEX.has(value)) return [value];
  const band = /^(K|\d{1,2})-(\d{1,2})$/.exec(value);
  if (!band) return [];
  const start = GRADE_INDEX.get(band[1]);
  const end = GRADE_INDEX.get(band[2]);
  if (start === undefined || end === undefined || start > end) return [];
  return ALL_GRADES.slice(start, end + 1);
}

/** True when a catalog grade shares at least one grade with `taught`. Empty `taught` matches everything. */
export function gradeOverlaps(
  catalogGrade: string,
  taught: readonly string[]
): boolean {
  if (taught.length === 0) return true;
  const expanded = expandGrade(catalogGrade);
  return expanded.some((g) => taught.includes(g));
}

/** Individual grades covered by the given bands, in display order. */
export function gradesFromBands(bands: readonly GradeLevel[]): string[] {
  const out = new Set<string>();
  for (const band of bands) {
    for (const g of BAND_GRADES[band] ?? []) out.add(g);
  }
  return sortGrades([...out]);
}

/** Bands touched by any of the given grades; empty input gives an empty result. */
export function bandsFromGrades(grades: readonly string[]): GradeLevel[] {
  const out: GradeLevel[] = [];
  for (const band of Object.keys(BAND_GRADES) as GradeLevel[]) {
    if (BAND_GRADES[band].some((g) => grades.includes(g))) out.push(band);
  }
  return out;
}

export const gradeLabel = (grade: string): string =>
  grade === 'K' ? 'K' : `Grade ${grade}`;
