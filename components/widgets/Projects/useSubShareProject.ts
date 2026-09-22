import { useInSubShare, useShareContent } from '@/hooks/useShareContent';
import type {
  SubShareProjectGroupView,
  SubShareProjectPayload,
  SubShareProjectRunView,
} from '@/types';

export interface SubShareProject {
  /** False everywhere but `/subs`, where the caller must use this instead. */
  active: boolean;
  run: SubShareProjectRunView | null;
  groups: SubShareProjectGroupView[];
  loading: boolean;
}

/**
 * The teacher's project tracker inside a sub share.
 *
 * Both halves are closed to a substitute: the project lives under the
 * teacher's `users/` tree, and a `project_runs` read wants the run's own
 * teacher or a student in its classes. The run and its groups are bundled at
 * share time so the tracker draws, read-only.
 */
export function useSubShareProject(
  projectId: string | null | undefined
): SubShareProject {
  const inShare = useInSubShare();
  const bundled = useShareContent<SubShareProjectPayload>('project', projectId);
  return {
    active: inShare,
    run: bundled.payload?.run ?? null,
    groups: bundled.payload?.groups ?? [],
    loading: bundled.status === 'loading',
  };
}
