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
  const writes: [string, string][] = [[rosterId, contextId]];
  const stale = new Set([contextId, ...(replacedIds ?? [])]);
  for (const r of rosters) {
    if (r.id !== rosterId && r.ltiContextId && stale.has(r.ltiContextId)) {
      writes.push([r.id, '']);
    }
  }
  // Each write stands alone so one failure doesn't leave the others stale.
  const results = await Promise.allSettled(
    writes.map(([id, ltiContextId]) => updateRoster(id, { ltiContextId }))
  );
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) throw failed.reason;
}
