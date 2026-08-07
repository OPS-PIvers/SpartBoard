/**
 * Scope-change logic for `usePlcBuildingDirectory`, which — unlike the
 * single-`orgId` family in `orgSubscriptionKey.ts` — scopes its Firestore
 * query on TWO independent inputs: `orgId` AND `buildingId` (the latter
 * live-derived from `useAuth().selectedBuildings` / `buildingIds`, both of
 * which can change mid-session — a user picking a different building in the
 * Sidebar, or a live `onSnapshot` on the member doc when an org admin edits
 * the user's building assignment while they have the PLC hub open).
 *
 * A clear gated only on `!shouldSubscribe` misses staying subscribed while
 * either scope value changes on its own, leaving the previous org/building's
 * directory entries rendered under the new scope until the next snapshot
 * lands. Same bug class `orgSubscriptionKey.ts` fixed for the single-orgId
 * hooks (useOrgBuildings #2276, generalized to 6 more siblings in #2374) —
 * `usePlcBuildingDirectory` predates that fix and was never ported.
 */

export interface PlcDirectoryScope {
  shouldSubscribe: boolean;
  orgId: string | null;
  buildingId: string | null;
}

/** Whether a hook's directory state must be cleared on a scope transition. */
export function shouldClearPlcDirectoryOnScopeChange(
  next: PlcDirectoryScope,
  prev: PlcDirectoryScope
): boolean {
  return (
    !next.shouldSubscribe ||
    next.orgId !== prev.orgId ||
    next.buildingId !== prev.buildingId
  );
}
