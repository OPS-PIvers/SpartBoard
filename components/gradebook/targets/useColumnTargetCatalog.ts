import { useMemo } from 'react';
import { useAuth } from '@/context/useAuth';
import { useStandardsCatalog } from '@/hooks/useStandardsCatalog';
import { useLearningTargetSources } from '@/hooks/useLearningTargets';
import {
  parentTagFromBenchmarkTag,
  tagFromBenchmark,
  tagFromTarget,
} from '@/utils/learningTargets';
import type { GradebookTargetTag } from '@/utils/gradebook/gradebookCore';

export interface TargetCatalogEntry {
  tag: GradebookTargetTag;
  search: string;
}

const entry = (tag: GradebookTargetTag): TargetCatalogEntry => ({
  tag,
  search: `${tag.code ?? ''} ${tag.label}`.toLowerCase(),
});

/** Tags a column can carry: standards (not benchmarks) for the teacher's grades, then their PLC and personal targets. */
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
    const grades = new Set(effectiveGrades);
    for (const b of benchmarks) {
      if (grades.size > 0 && !grades.has(b.grade)) continue;
      const standard = parentTagFromBenchmarkTag(tagFromBenchmark(b));
      if (standard) add(standard);
    }
    for (const source of sources) {
      for (const t of source.list?.targets ?? []) {
        if (!t.archived) add(tagFromTarget(t, source.kind, source.ownerId));
      }
    }
    return out;
  }, [sources, benchmarks, effectiveGrades]);

  return { entries, loading };
}
