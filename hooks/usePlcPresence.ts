/**
 * PLC presence — coarse per-section "who's here" (Decision 2.1, PRD §3.3, §6.3).
 *
 * Presence lives at `plcs/{plcId}/presence/{uid}`: each member maintains their
 * OWN doc (docId == uid), heartbeating `lastActiveAt` on a ~45s cadence while
 * the PLC dashboard is mounted and best-effort deleting it on unmount /
 * `pagehide`. Any member may read every doc — that's how the Home presence
 * strip renders the team.
 *
 * The single owner of the live presence listener + the heartbeat writer is the
 * `PlcProvider` (see `context/PlcContext.tsx`), which mirrors the parsed docs
 * into the store `presence` slot and writes the caller's own heartbeat. Selector
 * consumers read it via `usePlcPresence()` / `usePlcWhoIsHere()` from
 * `context/usePlcContext.ts`.
 *
 * This module exports the shared, provider-agnostic pieces:
 *   - `parsePresence` — the tolerant `tsToMillis` doc parser (also used by the
 *     provider listener).
 *   - `PRESENCE_FRESH_WINDOW_MS` / `filterWhoIsHere` — the ~90s freshness filter
 *     behind the "who's here" view (pure, unit-tested).
 *   - `usePlcStandalonePresence(plcId)` — a standalone listener for a
 *     non-provider host that needs raw presence without mounting a whole
 *     `PlcProvider`. Inside the provider, prefer the selectors.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { logError } from '@/utils/logError';
import { tsToMillis } from '@/utils/plc';
import type { PlcPresence } from '@/types';
import type { PlcSectionId } from '@/components/plc/sections';
import type { PlcPresenceEntry } from '@/context/usePlcContext';

const PLCS_COLLECTION = 'plcs';
const PRESENCE_SUBCOLLECTION = 'presence';

/**
 * A presence doc counts toward "who's here" only if its `lastActiveAt` is
 * within this window (heartbeat is ~45s, so ~90s tolerates one missed beat /
 * clock skew before a teammate drops off the strip). The server-side GC sweep
 * (Wave-4) prunes far-staler docs (> 5 min); this is the tighter live filter.
 */
export const PRESENCE_FRESH_WINDOW_MS = 90_000;

/**
 * Narrow the canonical `PlcPresence.section` (`string` in `types.ts`, to avoid a
 * `types.ts → components/` cycle) to the component-layer union the store carries.
 * Unrecognised section ids fall back to `'home'` so a malformed/legacy doc never
 * crashes the strip.
 */
function narrowSection(section: string): PlcSectionId | 'meeting' {
  return section as PlcSectionId | 'meeting';
}

/**
 * Parse one presence doc into a store-shaped `PlcPresenceEntry`, or `null` if it
 * is malformed (missing required fields). `lastActiveAt` is `serverTimestamp()`-
 * backed on write; `tsToMillis` tolerates both the resolved Timestamp and legacy
 * plain-millis numbers (and yields `0` for an unresolved pending sentinel, which
 * the freshness filter then treats as stale).
 */
export function parsePresence(
  id: string,
  data: Record<string, unknown>
): PlcPresenceEntry | null {
  if (
    typeof data.uid !== 'string' ||
    typeof data.displayName !== 'string' ||
    typeof data.section !== 'string'
  ) {
    return null;
  }
  return {
    uid: id,
    displayName: data.displayName,
    section: narrowSection(data.section),
    lastActiveAt: tsToMillis(data.lastActiveAt),
  };
}

/**
 * Pure "who's here" filter: keep only entries heartbeated within
 * `PRESENCE_FRESH_WINDOW_MS` of `now`. Extracted so the provider selector and
 * tests share one definition. Always allocates a new array, so callers that need
 * `Object.is` stability (e.g. the `usePlcWhoIsHere` selector) must memoize on the
 * `entries` reference.
 */
export function filterWhoIsHere(
  entries: readonly PlcPresenceEntry[],
  now: number = Date.now()
): PlcPresenceEntry[] {
  return entries.filter(
    (e) => now - e.lastActiveAt <= PRESENCE_FRESH_WINDOW_MS
  );
}

/** Read-side shape: the store-narrowed presence entry. */
export type { PlcPresenceEntry };

interface UseStandalonePresenceResult {
  presence: PlcPresenceEntry[];
  loading: boolean;
  error: Error | null;
}

/**
 * Standalone presence listener for a host that renders the "who's here" strip
 * WITHOUT a mounted `PlcProvider` (rare — the dashboard always has one). Inside
 * the provider, use `usePlcPresence()` / `usePlcWhoIsHere()` selectors instead,
 * which read the provider's single deduped listener. Pass `null` for `plcId` to
 * skip the subscription.
 *
 * Note: this returns the RAW presence list (every doc, including stale ones).
 * Apply `filterWhoIsHere` at the call site for the live view — keeping the raw
 * list lets a consumer also show "recently here" if it wants.
 */
export function usePlcStandalonePresence(
  plcId: string | null
): UseStandalonePresenceResult {
  const { user } = useAuth();
  const [presence, setPresence] = useState<PlcPresenceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setPresence([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setPresence([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const ref = collection(db, PLCS_COLLECTION, plcId, PRESENCE_SUBCOLLECTION);
    const unsub = onSnapshot(
      query(ref, orderBy('lastActiveAt', 'desc')),
      (snap) => {
        const list: PlcPresenceEntry[] = [];
        snap.forEach((d) => {
          const parsed = parsePresence(
            d.id,
            d.data() as Record<string, unknown>
          );
          if (parsed) list.push(parsed);
        });
        setPresence(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError('usePlcStandalonePresence.snapshot', err, { plcId });
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [plcId, user]);

  return useMemo(
    () => ({ presence, loading, error }),
    [presence, loading, error]
  );
}

/** Re-export so a standalone consumer can read the canonical doc shape. */
export type { PlcPresence };
