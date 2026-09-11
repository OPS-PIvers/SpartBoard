import type { StandardBenchmark } from '@/types';
import { gradeOverlaps } from '@/utils/gradeMatch';
import { benchmarkHeading } from '@/utils/standardsCatalog';

export interface StandardNode {
  key: string;
  set: string;
  code: string;
  title: string;
  benchmarks: StandardBenchmark[];
}

export interface StrandNode {
  key: string;
  name: string;
  standards: StandardNode[];
}

export interface SubjectNode {
  subject: string;
  strands: StrandNode[];
}

export interface StandardsTree {
  subjects: SubjectNode[];
}

export interface TreeFilter {
  /** Subject id, or null for every subject. */
  subject: string | null;
  /** Individual grades; empty = all grades. */
  grades: readonly string[];
  query: string;
}

export interface FilteredTree extends StandardsTree {
  /** Standard keys whose heading or benchmarks matched the query. */
  matchedStandards: Set<string>;
}

const strandNumber = (code: string): number => {
  const n = Number(code.split('.')[1]);
  return Number.isFinite(n) ? n : 0;
};

const codeSortValue = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** Groups the catalog by subject → strand → standard; benchmarks keep code order. */
export function buildStandardsTree(
  benchmarks: readonly StandardBenchmark[]
): StandardsTree {
  const subjects = new Map<string, Map<string, StrandNode>>();
  const strandOrder = new Map<string, number>();
  const standardsByKey = new Map<string, StandardNode>();

  for (const b of benchmarks) {
    let strands = subjects.get(b.subject);
    if (!strands) {
      strands = new Map();
      subjects.set(b.subject, strands);
    }
    const strandKey = `${b.subject}|${b.strand}`;
    let strand = strands.get(strandKey);
    if (!strand) {
      strand = { key: strandKey, name: b.strand, standards: [] };
      strands.set(strandKey, strand);
      strandOrder.set(strandKey, strandNumber(b.code));
    }
    const heading = benchmarkHeading(b);
    const standardKey = `${b.set}|${heading.code}`;
    let standard = standardsByKey.get(standardKey);
    if (!standard) {
      standard = {
        key: standardKey,
        set: b.set,
        code: heading.code,
        title: heading.title,
        benchmarks: [],
      };
      standardsByKey.set(standardKey, standard);
      strand.standards.push(standard);
    }
    standard.benchmarks.push(b);
  }

  const sortedSubjects = [...subjects.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subject, strands]) => ({
      subject,
      strands: [...strands.values()]
        .sort(
          (a, b) =>
            (strandOrder.get(a.key) ?? 0) - (strandOrder.get(b.key) ?? 0)
        )
        .map((strand) => ({
          ...strand,
          standards: strand.standards
            .map((s) => ({
              ...s,
              benchmarks: [...s.benchmarks].sort((x, y) =>
                codeSortValue(x.code, y.code)
              ),
            }))
            .sort((a, b) => codeSortValue(a.code, b.code)),
        })),
    }));

  return { subjects: sortedSubjects };
}

const terms = (query: string): string[] =>
  query.toLowerCase().split(/\s+/).filter(Boolean);

const matchesTerms = (haystack: string, words: readonly string[]): boolean =>
  words.every((w) => haystack.includes(w));

/**
 * Applies subject, grade and search filters while keeping the tree shape.
 * A standard whose heading matches keeps every grade-visible benchmark;
 * otherwise only matching benchmarks remain. Empty branches are dropped.
 */
export function filterStandardsTree(
  tree: StandardsTree,
  filter: TreeFilter
): FilteredTree {
  const words = terms(filter.query);
  const matchedStandards = new Set<string>();
  const subjects: SubjectNode[] = [];

  for (const subject of tree.subjects) {
    if (filter.subject && subject.subject !== filter.subject) continue;
    const strands: StrandNode[] = [];
    for (const strand of subject.strands) {
      const standards: StandardNode[] = [];
      for (const standard of strand.standards) {
        const byGrade = standard.benchmarks.filter((b) =>
          gradeOverlaps(b.grade, filter.grades)
        );
        if (byGrade.length === 0) continue;
        if (words.length === 0) {
          standards.push({ ...standard, benchmarks: byGrade });
          continue;
        }
        const headingText = `${standard.code} ${standard.title}`.toLowerCase();
        if (matchesTerms(headingText, words)) {
          matchedStandards.add(standard.key);
          standards.push({ ...standard, benchmarks: byGrade });
          continue;
        }
        const matching = byGrade.filter((b) =>
          matchesTerms(b.searchText, words)
        );
        if (matching.length > 0) {
          matchedStandards.add(standard.key);
          standards.push({ ...standard, benchmarks: matching });
        }
      }
      if (standards.length > 0) strands.push({ ...strand, standards });
    }
    if (strands.length > 0) subjects.push({ ...subject, strands });
  }

  return { subjects, matchedStandards };
}

/** Subject ids present in the catalog, in tree order. */
export const treeSubjectIds = (tree: StandardsTree): string[] =>
  tree.subjects.map((s) => s.subject);
