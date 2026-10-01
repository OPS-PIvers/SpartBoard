// My Groups for the Routine Guide Show menu, and the routines a group's goals link.

import { useMemo } from 'react';
import { useAuth } from '@/context/useAuth';
import { usePlcs } from '@/hooks/usePlcs';
import { usePlcGoals } from '@/hooks/usePlcGoals';

export const GROUP_FILTER_PREFIX = 'group:';

export const groupIdFromFilter = (filter: string): string | null =>
  filter.startsWith(GROUP_FILTER_PREFIX)
    ? filter.slice(GROUP_FILTER_PREFIX.length)
    : null;

export function useRoutineGuideGroups(filter: string) {
  const { canAccessFeature } = useAuth();
  const enabled = canAccessFeature('my-groups');
  const { plcs, loading } = usePlcs({ enabled });
  const groupId = enabled ? groupIdFromFilter(filter) : null;
  const { goals, loading: goalsLoading } = usePlcGoals(groupId);

  const groups = useMemo(
    () =>
      enabled
        ? plcs
            .map((p) => ({ id: p.id, name: p.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [enabled, plcs]
  );

  const routineIds = useMemo(() => {
    const ids = new Set<string>();
    for (const goal of goals) {
      for (const p of goal.practices) if (p.routineId) ids.add(p.routineId);
    }
    return ids;
  }, [goals]);

  return {
    enabled,
    groups,
    groupId,
    /** The selected group no longer lists this teacher (left or removed). */
    missing: !!groupId && !loading && !groups.some((g) => g.id === groupId),
    routineIds,
    loading: loading || goalsLoading,
  };
}
