/**
 * useLtiSessionNames — teacher-side name resolution for Schoology LTI students.
 *
 * The NRPS analogue of `useAssignmentPseudonymsMulti`. A Schoology student's
 * response doc is keyed by a `schoology-sub` pseudonym uid that lives in no
 * ClassLink roster, so the ClassLink resolver can't name them. Instead this
 * hook calls `ltiResolveNamesForAssignmentV1`, which fetches the session's
 * Schoology context roster over NRPS and returns `{ uid → name }` — resolved
 * ON READ, never stored. The result merges into the monitor's existing
 * `byStudentUid` map, so `resolveResponseDisplayName` names Schoology students
 * exactly like ClassLink ones.
 *
 * Gated by `enabled` (the session's `ltiNrps` flag) so it is a complete no-op —
 * zero callable invocations — for every non-LTI session, which is the vast
 * majority. The NRPS roster is the whole class (not just joined students) and
 * stable for the session, so a single cached fetch covers everyone; the
 * module-level promise cache de-dupes sibling viewers and is invalidated when
 * the authenticated teacher changes.
 */

import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/config/firebase';
import { logError } from '@/utils/logError';
import type { StudentName } from '@/hooks/useAssignmentPseudonyms';

interface ResolveNamesResponse {
  names?: Record<string, { givenName?: string; familyName?: string }>;
}

const EMPTY = new Map<string, StudentName>();

let cacheOwnerUid: string | null = null;
let cache = new Map<string, Promise<Map<string, StudentName>>>();

function fetchSessionNames(
  sessionId: string,
  teacherUid: string
): Promise<Map<string, StudentName>> {
  if (cacheOwnerUid !== teacherUid) {
    cache = new Map();
    cacheOwnerUid = teacherUid;
  }
  const cached = cache.get(sessionId);
  if (cached) return cached;

  const callable = httpsCallable<{ sessionId: string }, ResolveNamesResponse>(
    functions,
    'ltiResolveNamesForAssignmentV1'
  );
  const promise = callable({ sessionId }).then((res) => {
    const entries = res.data?.names ?? {};
    const map = new Map<string, StudentName>();
    for (const [uid, n] of Object.entries(entries)) {
      map.set(uid, {
        givenName: n.givenName ?? '',
        familyName: n.familyName ?? '',
      });
    }
    return map;
  });

  cache.set(sessionId, promise);
  // Evict on failure so a transient CF error doesn't poison the cache forever.
  promise.catch(() => {
    if (cache.get(sessionId) === promise) cache.delete(sessionId);
  });
  return promise;
}

export function useLtiSessionNames(
  sessionId: string | null | undefined,
  enabled: boolean
): Map<string, StudentName> {
  const [resolved, setResolved] = useState<{
    key: string;
    map: Map<string, StudentName>;
  }>({ key: '', map: EMPTY });

  useEffect(() => {
    if (!enabled || !sessionId) return;
    const teacherUid = auth.currentUser?.uid ?? '';
    if (!teacherUid) return;
    let cancelled = false;
    fetchSessionNames(sessionId, teacherUid)
      .then((map) => {
        if (!cancelled) setResolved({ key: sessionId, map });
      })
      .catch((err) => {
        if (!cancelled)
          logError('useLtiSessionNames.fetch', err, { sessionId });
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, enabled]);

  return resolved.key === sessionId && sessionId ? resolved.map : EMPTY;
}
