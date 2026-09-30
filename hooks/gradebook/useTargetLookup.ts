import { useCallback, useMemo } from 'react';
import { useStandardsCatalog } from '@/hooks/useStandardsCatalog';
import type { GradebookTargetTag } from '@/utils/gradebook/gradebookCore';

/** Labels for standard benchmark ids that reach the gradebook without a tag. */
export function useTargetLookup(): (
  id: string
) => GradebookTargetTag | undefined {
  const { benchmarks } = useStandardsCatalog();
  const byId = useMemo(
    () => new Map(benchmarks.map((b) => [b.id, b])),
    [benchmarks]
  );
  return useCallback(
    (id: string) => {
      const b = byId.get(id);
      return b
        ? { id, kind: 'standard', code: b.code, label: b.text }
        : undefined;
    },
    [byId]
  );
}
