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
  await syncRosterMirrorsBatch(
    rosters,
    [{ rosterId, contextId }],
    replacedIds,
    updateRoster
  );
}

/** One set of mirror writes for several links: linked rosters are set, never cleared. */
export async function syncRosterMirrorsBatch(
  rosters: ClassRoster[],
  links: { rosterId: string; contextId: string }[],
  replacedIds: string[] | undefined,
  updateRoster: UpdateRoster
): Promise<void> {
  const linked = new Set(links.map((l) => l.rosterId));
  const writes: [string, string][] = links.map((l) => [
    l.rosterId,
    l.contextId,
  ]);
  const stale = new Set([
    ...links.map((l) => l.contextId),
    ...(replacedIds ?? []),
  ]);
  for (const r of rosters) {
    if (!linked.has(r.id) && r.ltiContextId && stale.has(r.ltiContextId)) {
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
