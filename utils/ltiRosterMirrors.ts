import type { ClassRoster } from '@/types';

type UpdateRoster = (
  id: string,
  updates: Partial<ClassRoster>
) => Promise<void>;

/** Point `rosterId`'s mirror at `contextId` and clear any other roster mirroring it or a replaced link. */
export async function syncRosterMirrors(
  rosters: ClassRoster[],
  rosterId: string,
  contextId: string,
  replacedIds: string[] | undefined,
  updateRoster: UpdateRoster
): Promise<void> {
  await updateRoster(rosterId, { ltiContextId: contextId });
  const stale = new Set([contextId, ...(replacedIds ?? [])]);
  for (const r of rosters) {
    if (r.id !== rosterId && r.ltiContextId && stale.has(r.ltiContextId)) {
      await updateRoster(r.id, { ltiContextId: '' });
    }
  }
}
