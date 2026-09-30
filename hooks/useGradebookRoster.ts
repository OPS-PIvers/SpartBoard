import { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/config/firebase';
import { logError } from '@/utils/logError';
import type { ClassRoster } from '@/types';
import {
  isGradebookRoster,
  joinGradebookRoster,
  type GradebookRosterEntry,
  type GradebookRosterJoin,
} from '@/utils/gradebookRoster';

export type GradebookRosterStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface GradebookRosterState extends GradebookRosterJoin {
  status: GradebookRosterStatus;
}

interface CallableResponse {
  students?: GradebookRosterEntry[];
}

const EMPTY_JOIN: GradebookRosterJoin = {
  studentUidByStudentId: new Map(),
  studentByUid: new Map(),
  unmatchedStudentIds: [],
  unrosteredUids: [],
};

let cacheOwnerUid: string | null = null;
let cache = new Map<string, Promise<GradebookRosterEntry[]>>();

/** Session cache per roster; cleared when the signed-in teacher changes. */
function fetchGradebookRoster(
  teacherUid: string,
  rosterId: string
): Promise<GradebookRosterEntry[]> {
  if (cacheOwnerUid !== teacherUid) {
    cache = new Map();
    cacheOwnerUid = teacherUid;
  }
  const cached = cache.get(rosterId);
  if (cached) return cached;
  const callable = httpsCallable<{ rosterId: string }, CallableResponse>(
    functions,
    'getGradebookRosterV1'
  );
  const promise = callable({ rosterId }).then((res) =>
    (res.data?.students ?? []).filter(
      (e): e is GradebookRosterEntry =>
        typeof e?.refKey === 'string' && typeof e?.studentUid === 'string'
    )
  );
  cache.set(rosterId, promise);
  promise.catch(() => {
    if (cache.get(rosterId) === promise) cache.delete(rosterId);
  });
  return promise;
}

/** Test-only: drop the session cache. */
export function resetGradebookRosterCache(): void {
  cache = new Map();
  cacheOwnerUid = null;
}

/** Maps a ClassLink or test-class roster's students to stable uids (GRADEBOOK.md D8). */
export function useGradebookRoster(
  roster: ClassRoster | null | undefined,
  enabled: boolean
): GradebookRosterState {
  const rosterId =
    enabled && roster && isGradebookRoster(roster) ? roster.id : '';
  const [fetched, setFetched] = useState<{
    rosterId: string;
    entries: GradebookRosterEntry[] | null;
  }>({ rosterId: '', entries: null });

  useEffect(() => {
    if (!rosterId) return;
    const teacherUid = auth.currentUser?.uid;
    if (!teacherUid) return;
    let cancelled = false;
    fetchGradebookRoster(teacherUid, rosterId).then(
      (entries) => {
        if (!cancelled) setFetched({ rosterId, entries });
      },
      (err: unknown) => {
        if (cancelled) return;
        logError('useGradebookRoster', err, { rosterId });
        setFetched({ rosterId, entries: null });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [rosterId]);

  const entries = fetched.rosterId === rosterId ? fetched.entries : null;
  const join = useMemo(
    () => (roster && entries ? joinGradebookRoster(roster, entries) : null),
    [roster, entries]
  );

  if (!rosterId) return { status: 'idle', ...EMPTY_JOIN };
  if (fetched.rosterId !== rosterId)
    return { status: 'loading', ...EMPTY_JOIN };
  if (!join) return { status: 'error', ...EMPTY_JOIN };
  return { status: 'ready', ...join };
}
