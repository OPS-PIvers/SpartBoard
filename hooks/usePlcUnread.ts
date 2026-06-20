/**
 * Per-PLC unread tracking (Decision 2.2, §3.4).
 *
 * Each member keeps a private cursor at `/users/{uid}/plc_state/{plcId}`
 * (`{ lastSeenAt }`, owner-only). "Since you were here" is the set of activity
 * events with `createdAt > lastSeenAt`; the sidebar badge counts them.
 *
 * `usePlcUnread(plcId)` owns BOTH sides of the unread substrate for a single
 * PLC, so a host (the sidebar PLC row, the Home digest) can drop it in without a
 * `PlcProvider`:
 *   - an owner-only `onSnapshot` of the caller's `plc_state/{plcId}` cursor, and
 *   - a bounded (`limit(50)`) always-on activity listener for the same PLC.
 *
 * It exposes `lastSeenAt`, a `markSeen()` mutator (writes `serverTimestamp()` so
 * the cursor jumps past every loaded event), and a derived `unreadCount`
 * (pure `deriveUnreadCount` over the activity + cursor). `markSeen()` zeroes the
 * count: it advances the cursor to "now", so no loaded event has
 * `createdAt > lastSeenAt` afterward.
 *
 * Inside a mounted `PlcProvider`, the provider already runs the activity
 * listener; pass its `usePlcActivity()` list via the `activity` option to avoid
 * a second listener (the hook then only subscribes to the cursor). Standalone
 * hosts omit it and the hook self-subscribes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { logError } from '@/utils/logError';
import { tsToMillis } from '@/utils/plc';
import { deriveUnreadCount, parseActivity } from '@/utils/plcActivity';
import type { PlcActivityEvent } from '@/types';

const PLCS_COLLECTION = 'plcs';
const ACTIVITY_SUBCOLLECTION = 'activity';
const USERS_COLLECTION = 'users';
const PLC_STATE_SUBCOLLECTION = 'plc_state';

/** Same bound the provider's activity listener uses (PRD §3.4). */
const ACTIVITY_PAGE_SIZE = 50;

const EMPTY_ACTIVITY: PlcActivityEvent[] = [];

export interface UsePlcUnreadOptions {
  /**
   * When the caller already has the PLC's activity feed (e.g. inside a
   * `PlcProvider` via `usePlcActivity()`), pass it here so the hook does NOT
   * open its own activity listener. Omit for standalone hosts (the sidebar),
   * where the hook self-subscribes to a bounded activity query.
   */
  activity?: readonly PlcActivityEvent[];
  /** Skip both subscriptions entirely (e.g. while the host is collapsed). */
  enabled?: boolean;
}

export interface UsePlcUnreadResult {
  /** The cursor in ms, or `null` if the member has no cursor yet. */
  lastSeenAt: number | null;
  /** Count of activity events newer than the cursor (Decision 2.2). */
  unreadCount: number;
  /** Advance the cursor to now (`serverTimestamp()`) — zeroes `unreadCount`. */
  markSeen: () => Promise<void>;
  /** True until the cursor's first snapshot settles. */
  loading: boolean;
}

/**
 * Owner-only listener for the caller's `plc_state/{plcId}` cursor. Returns the
 * parsed `lastSeenAt` (ms) or `null` when no cursor doc exists yet, plus a
 * `loading` flag for the first snapshot. `null` uid / auth-bypass short-circuit
 * to a settled `null` cursor (every event then counts as unread).
 */
function useLastSeenCursor(
  plcId: string | null,
  enabled: boolean
): { lastSeenAt: number | null; loading: boolean } {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  // Will the effect open a listener? When not, there is no pending read, so the
  // cursor is settled (`loading: false`) from the first render.
  const willSubscribe = enabled && !!plcId && !!uid && !isAuthBypass;
  const [lastSeenAt, setLastSeenAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(willSubscribe);

  // Reset on PLC / user change (prev-prop pattern, not an effect) so a stale
  // cursor never bleeds across PLCs. `loading` is set here from `willSubscribe`
  // — the effect itself never calls setState synchronously (it only sets state
  // from the async snapshot callbacks), satisfying react-hooks/set-state-in-effect.
  const key = `${plcId ?? ''}:${uid ?? ''}:${enabled}`;
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setLastSeenAt(null);
    setLoading(willSubscribe);
  }

  useEffect(() => {
    if (!willSubscribe || !plcId || !uid) return;
    const ref = doc(db, USERS_COLLECTION, uid, PLC_STATE_SUBCOLLECTION, plcId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        setLastSeenAt(
          data && data.lastSeenAt !== undefined
            ? tsToMillis(data.lastSeenAt)
            : null
        );
        setLoading(false);
      },
      (err) => {
        logError('usePlcUnread.cursor', err, { plcId });
        setLastSeenAt(null);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [plcId, uid, willSubscribe]);

  return { lastSeenAt, loading };
}

/**
 * Bounded always-on activity listener for ONE PLC (mirrors the provider's
 * `useActivityListener`). Only mounts when the caller did NOT supply an
 * `activity` list and the hook is enabled — otherwise it returns the supplied
 * list (or empty) without opening a listener.
 */
function useStandaloneActivity(
  plcId: string | null,
  enabled: boolean
): PlcActivityEvent[] {
  const { user } = useAuth();
  const [activity, setActivity] = useState<PlcActivityEvent[]>(EMPTY_ACTIVITY);

  const key = `${plcId ?? ''}:${enabled}`;
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setActivity(EMPTY_ACTIVITY);
  }

  useEffect(() => {
    if (!enabled || !plcId || !user || isAuthBypass) return;
    const ref = collection(db, PLCS_COLLECTION, plcId, ACTIVITY_SUBCOLLECTION);
    const unsub = onSnapshot(
      query(ref, orderBy('createdAt', 'desc'), limit(ACTIVITY_PAGE_SIZE)),
      (snap) => {
        const list: PlcActivityEvent[] = [];
        snap.forEach((d) => {
          const parsed = parseActivity(
            d.id,
            d.data() as Record<string, unknown>
          );
          if (parsed) list.push(parsed);
        });
        setActivity(list);
      },
      (err) => {
        logError('usePlcUnread.activity', err, { plcId });
        setActivity(EMPTY_ACTIVITY);
      }
    );
    return () => unsub();
  }, [plcId, enabled, user]);

  return activity;
}

/**
 * Track unread activity for a single PLC. Pass `null` for `plcId` to disable
 * (returns a settled, zero-count result). See the module docstring for the
 * provider vs. standalone activity-source contract.
 */
export function usePlcUnread(
  plcId: string | null,
  options: UsePlcUnreadOptions = {}
): UsePlcUnreadResult {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const enabled = options.enabled !== false;
  // Self-subscribe to activity only when the caller didn't supply it.
  const suppliedActivity = options.activity;
  const ownsActivityListener = suppliedActivity === undefined;
  const standaloneActivity = useStandaloneActivity(
    plcId,
    enabled && ownsActivityListener
  );
  const activity = suppliedActivity ?? standaloneActivity;

  const { lastSeenAt, loading } = useLastSeenCursor(plcId, enabled);

  // Pass the current uid so per-mention events addressed to OTHER members are
  // excluded from this member's badge (Decision 2.3 — no per-event spam). A
  // mention addressed to me still counts.
  const unreadCount = useMemo(
    () => deriveUnreadCount(activity, lastSeenAt, uid),
    [activity, lastSeenAt, uid]
  );

  const markSeen = useCallback(async (): Promise<void> => {
    if (!plcId || !uid || isAuthBypass) return;
    const ref = doc(db, USERS_COLLECTION, uid, PLC_STATE_SUBCOLLECTION, plcId);
    // serverTimestamp() so the cursor jumps past every loaded event — the
    // schema-locked rule accepts a single `lastSeenAt` (int || timestamp).
    await setDoc(ref, { lastSeenAt: serverTimestamp() });
  }, [plcId, uid]);

  return useMemo(
    () => ({ lastSeenAt, unreadCount, markSeen, loading }),
    [lastSeenAt, unreadCount, markSeen, loading]
  );
}
