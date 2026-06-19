import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  query,
  where,
  limit as fbLimit,
  onSnapshot,
  type QueryConstraint,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';

/**
 * `usePlcBuildingDirectory` — the "PLCs in my building" discovery feed behind
 * the `/plc` index hub (PRD §2.1, Decision 1.1).
 *
 * Surfaces the read-only metadata of PLCs that share the current user's
 * `orgId` (and `buildingId`, when the user has one) that the user is NOT
 * already a member of — so a teacher can discover and request to join a
 * neighboring team rather than only seeing the PLCs they already belong to.
 *
 * Tenancy scoping (Decision 1.1):
 *   - The user's `orgId` is resolved from `useAuth()` (the org-membership doc),
 *     so the directory is naturally bounded to a single district with NO extra
 *     server round-trip — the value is already in the auth context.
 *   - `buildingId` is the user's first selected building (their `selectedBuildings`
 *     UI choice, falling back to their scoped-admin `buildingIds`). When the
 *     user has a building, the query narrows to that building; when they don't,
 *     it returns the whole org's PLCs (still bounded by `limit`).
 *
 * Query shape (index notes):
 *   - `where('orgId','==', orgId)` is an equality filter → automatic single-field
 *     index, no composite required.
 *   - Adding `where('buildingId','==', buildingId)` makes it two equality filters.
 *     A composite `plcs (orgId ASC, buildingId ASC)` index is committed in
 *     `firestore.indexes.json` so the two-filter query is served deterministically
 *     rather than relying on Firestore's index-merge heuristic.
 *   - Bounded by `limit` so a large district can't stream an unbounded result set.
 *
 * Authorization: the `/plcs` read rule allows an authenticated org member to
 * read PLC docs carrying their `orgId` (the directory read branch). The doc
 * exposes only teacher membership metadata (no student PII); this hook further
 * projects each doc down to `{ id, name, memberCount }` so consumers never
 * surface the raw membership arrays.
 *
 * Exclusion: PLCs the user is already a member of are filtered out client-side
 * (they already appear in the "Your PLCs" section from `usePlcs`), so the
 * directory is strictly "PLCs you could join."
 */

/** Read-only metadata projection of a discoverable PLC. */
export interface PlcDirectoryEntry {
  id: string;
  name: string;
  /** Active member count — drives the directory card's "N members" label. */
  memberCount: number;
  orgId: string;
  buildingId: string | null;
}

export interface UsePlcBuildingDirectoryOptions {
  /**
   * Skip the Firestore subscription when false (e.g. while the hub drawer is
   * closed). Defaults to true.
   */
  enabled?: boolean;
  /**
   * Max number of directory PLCs to stream. Bounds the read cost on a large
   * district. Defaults to 50.
   */
  limit?: number;
}

export interface UsePlcBuildingDirectoryResult {
  /** Discoverable PLCs in the user's org/building, excluding ones they're in. */
  entries: PlcDirectoryEntry[];
  loading: boolean;
  error: Error | null;
  /** The org id the directory is scoped to (null when the user has no org). */
  orgId: string | null;
  /** The building id the directory is scoped to (null = whole-org directory). */
  buildingId: string | null;
}

const PLCS_COLLECTION = 'plcs';
const DEFAULT_DIRECTORY_LIMIT = 50;

const EMPTY_ENTRIES: PlcDirectoryEntry[] = [];

/**
 * Count the active members of a raw PLC doc. Prefers the denormalized
 * `memberUids` index (always present + kept in lockstep with the canonical
 * `members` map on every membership write); falls back to counting active
 * entries in the `members` map for any doc that somehow lacks the index.
 */
function readMemberCount(data: Record<string, unknown>): number {
  if (Array.isArray(data.memberUids)) {
    return (data.memberUids as unknown[]).filter((u) => typeof u === 'string')
      .length;
  }
  if (data.members && typeof data.members === 'object') {
    let count = 0;
    for (const raw of Object.values(data.members as Record<string, unknown>)) {
      if (
        raw &&
        typeof raw === 'object' &&
        (raw as { status?: unknown }).status !== 'removed'
      ) {
        count += 1;
      }
    }
    return count;
  }
  return 0;
}

/**
 * Project a raw PLC doc to a directory entry, or null when the shape is
 * unusable (missing name/orgId) — those are dropped silently rather than
 * surfacing a broken card.
 */
function parseDirectoryEntry(
  id: string,
  data: Record<string, unknown>
): PlcDirectoryEntry | null {
  if (typeof data.name !== 'string' || typeof data.orgId !== 'string') {
    return null;
  }
  return {
    id,
    name: data.name,
    memberCount: readMemberCount(data),
    orgId: data.orgId,
    buildingId: typeof data.buildingId === 'string' ? data.buildingId : null,
  };
}

export const usePlcBuildingDirectory = (
  options?: UsePlcBuildingDirectoryOptions
): UsePlcBuildingDirectoryResult => {
  const enabled = options?.enabled ?? true;
  const max = options?.limit ?? DEFAULT_DIRECTORY_LIMIT;
  const { user, orgId, selectedBuildings, buildingIds } = useAuth();

  // The user's building for directory scoping: prefer their explicit UI
  // building selection, falling back to a scoped-admin building, else none
  // (whole-org directory). Resolved from existing auth surfaces — no extra
  // Firestore read.
  const buildingId = selectedBuildings[0] ?? buildingIds[0] ?? null;

  const [entries, setEntries] = useState<PlcDirectoryEntry[]>(EMPTY_ENTRIES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const shouldSubscribe = enabled && !isAuthBypass && Boolean(user) && !!orgId;

  useEffect(() => {
    if (!shouldSubscribe || !orgId || !user) {
      // Defer the reset so we don't trip react-hooks/set-state-in-effect on
      // the signed-out / no-org branch (mirrors the usePlcs pattern).
      const timer = setTimeout(() => {
        setEntries(EMPTY_ENTRIES);
        setLoading(false);
        setError(null);
      }, 0);
      return () => clearTimeout(timer);
    }

    const constraints: QueryConstraint[] = [where('orgId', '==', orgId)];
    if (buildingId) {
      constraints.push(where('buildingId', '==', buildingId));
    }
    constraints.push(fbLimit(max));

    const q = query(collection(db, PLCS_COLLECTION), ...constraints);
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list: PlcDirectoryEntry[] = [];
        snap.forEach((d) => {
          const parsed = parseDirectoryEntry(
            d.id,
            d.data() as Record<string, unknown>
          );
          // Exclude PLCs the user already belongs to — those live in the
          // "Your PLCs" section. The membership check is on the raw doc's
          // `memberUids` so it works even if the parsed entry omits it.
          if (!parsed) return;
          const raw = d.data() as { memberUids?: unknown };
          const memberUids = Array.isArray(raw.memberUids)
            ? (raw.memberUids as unknown[])
            : [];
          if (memberUids.includes(user.uid)) return;
          list.push(parsed);
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        setEntries(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('PLC building-directory snapshot error:', err);
        setEntries(EMPTY_ENTRIES);
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsubscribe();
  }, [shouldSubscribe, orgId, buildingId, max, user]);

  return useMemo(
    () => ({ entries, loading, error, orgId, buildingId }),
    [entries, loading, error, orgId, buildingId]
  );
};
