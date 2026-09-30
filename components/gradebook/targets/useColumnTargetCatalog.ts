import { useMemo } from 'react';
import { useAuth } from '@/context/useAuth';
import { useStandardsCatalog } from '@/hooks/useStandardsCatalog';
import { useLearningTargetSources } from '@/hooks/useLearningTargets';
import { tagFromBenchmark, tagFromTarget } from '@/utils/learningTargets';
import type { GradebookTargetTag } from '@/utils/gradebook/gradebookCore';

export interface TargetCatalogEntry {
  tag: GradebookTargetTag;
  search: string;
}

const entry = (tag: GradebookTargetTag): TargetCatalogEntry => ({
  tag,
  search: `${tag.code ?? ''} ${tag.label}`.toLowerCase(),
});

/** Tags a column can carry: the teacher's PLC and personal targets, then standards for their grades. */
export function useColumnTargetCatalog(): {
  entries: TargetCatalogEntry[];
  loading: boolean;
} {
  const { effectiveGrades } = useAuth();
  const { benchmarks, loading } = useStandardsCatalog();
  const { sources } = useLearningTargetSources();

  const entries = useMemo(() => {
    const seen = new Set<string>();
    const out: TargetCatalogEntry[] = [];
    const add = (tag: GradebookTargetTag) => {
      if (seen.has(tag.id)) return;
      seen.add(tag.id);
      out.push(entry(tag));
    };
    for (const source of sources) {
      for (const t of source.list?.targets ?? []) {
        if (!t.archived) add(tagFromTarget(t, source.kind, source.ownerId));
      }
    }
    const grades = new Set(effectiveGrades);
    for (const b of benchmarks) {
      if (grades.size === 0 || grades.has(b.grade)) add(tagFromBenchmark(b));
    }
    return out;
  }, [sources, benchmarks, effectiveGrades]);

  return { entries, loading };
}
