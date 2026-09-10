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

export const toBenchmarkDoc = (row: StandardsFileRow): StandardBenchmark => ({
  id: row.id,
  set: row.set,
  subject: row.subject,
  code: row.code,
  grade: row.grade,
  strand: row.strand,
  standard: row.standard,
  text: row.text,
  searchText: `${row.code} ${row.text}`.toLowerCase(),
});

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
