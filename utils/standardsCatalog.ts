import type { StandardBenchmark, StandardSubject } from '@/types';

export type StandardsFileRow = Omit<StandardBenchmark, 'searchText'>;

export interface StandardsFile {
  set: string;
  subject: StandardSubject;
  source: string;
  revision: string;
  count: number;
  benchmarks: StandardsFileRow[];
}

export interface StandardSetEntry {
  set: string;
  subject: StandardSubject;
  label: string;
  load: () => Promise<StandardsFile>;
}

// Dynamic imports keep the ~280 KB JSON files out of the main bundle.
export const STANDARD_SETS: StandardSetEntry[] = [
  {
    set: 'mn-ela-2020',
    subject: 'ela',
    label: 'Minnesota ELA (2020)',
    load: async () =>
      (await import('@/config/standards/mn-ela-2020.json'))
        .default as StandardsFile,
  },
  {
    set: 'mn-ss-2021',
    subject: 'social-studies',
    label: 'Minnesota Social Studies (2021)',
    load: async () =>
      (await import('@/config/standards/mn-ss-2021.json'))
        .default as StandardsFile,
  },
];

export interface StandardHeading {
  /** 'R9', 'LSVEI 3' or '5'. */
  code: string;
  /** Heading text without the code or trailing description. */
  title: string;
}

// ELA headings read "R9 Media Literacy: …" or "LSVEI 1 Exchange ideas…";
// Social Studies headings read "5. Public Policy: …".
const ELA_HEADING = /^([A-Z]{1,6}\s?\d{1,2})\b[.:]?\s*(.*)$/s;
const SS_HEADING = /^(\d{1,2})\.\s*(.*)$/s;

const TITLE_MAX = 72;

// Headings without a colon are full sentences; keep the first clause so the title stays a label.
function shortTitle(rest: string): string {
  const colon = rest.indexOf(':');
  if (colon > 0) return rest.slice(0, colon).trim();
  const clause = rest.split(/[,;.]|\s-\s/)[0].trim();
  if (clause.length <= TITLE_MAX) return clause;
  return `${clause.slice(0, TITLE_MAX).replace(/\s+\S*$/, '')}…`;
}

/** Splits a standard's long text into its short code and title; falls back to the numeric key from the benchmark code. */
export function parseStandardHeading(
  standard: string,
  benchmarkCode: string
): StandardHeading {
  const text = standard.trim();
  const match = ELA_HEADING.exec(text) ?? SS_HEADING.exec(text);
  const title = shortTitle((match ? match[2] : text).trim());
  if (match) return { code: match[1].replace(/\s+/g, ' '), title };
  const parts = benchmarkCode.split('.');
  const code = parts.length >= 3 ? `${parts[1]}.${parts[2]}` : benchmarkCode;
  return { code, title: title || text };
}

/** Id of the standard-level tag a benchmark rolls up into. */
export const standardTagId = (set: string, standardCode: string): string =>
  `${set}:std:${standardCode}`;

export const STANDARD_TAG_MARKER = ':std:';

export const isStandardTagId = (id: string): boolean =>
  id.includes(STANDARD_TAG_MARKER);

/** Heading for a catalog doc, using the seeded fields when present. */
export const benchmarkHeading = (b: StandardBenchmark): StandardHeading =>
  b.standardCode && b.standardTitle !== undefined
    ? { code: b.standardCode, title: b.standardTitle }
    : parseStandardHeading(b.standard, b.code);

export const toBenchmarkDoc = (row: StandardsFileRow): StandardBenchmark => {
  const heading = parseStandardHeading(row.standard, row.code);
  return {
    id: row.id,
    set: row.set,
    subject: row.subject,
    code: row.code,
    grade: row.grade,
    strand: row.strand,
    standard: row.standard,
    text: row.text,
    searchText: `${row.code} ${row.text}`.toLowerCase(),
    standardCode: heading.code,
    standardTitle: heading.title,
  };
};

const BENCHMARK_FIELDS: Array<keyof StandardBenchmark> = [
  'id',
  'set',
  'subject',
  'code',
  'grade',
  'strand',
  'standard',
  'text',
  'searchText',
  'standardCode',
  'standardTitle',
];

const isSameBenchmark = (a: StandardBenchmark, b: StandardBenchmark) =>
  BENCHMARK_FIELDS.every((field) => a[field] === b[field]);

export interface CatalogDiff {
  added: StandardBenchmark[];
  updated: StandardBenchmark[];
  unchangedCount: number;
}

export const diffCatalog = (
  existing: Map<string, StandardBenchmark>,
  incoming: StandardBenchmark[]
): CatalogDiff => {
  const added: StandardBenchmark[] = [];
  const updated: StandardBenchmark[] = [];
  let unchangedCount = 0;
  for (const bench of incoming) {
    const current = existing.get(bench.id);
    if (!current) added.push(bench);
    else if (isSameBenchmark(current, bench)) unchangedCount += 1;
    else updated.push(bench);
  }
  return { added, updated, unchangedCount };
};

export const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};
