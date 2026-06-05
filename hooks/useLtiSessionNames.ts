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

/**
 * Session kind for the name resolver. Defaults to `'quiz'` everywhere so
 * existing quiz callers (QuizLiveMonitor, QuizResults) keep working with no
 * change; Video Activity callers pass `'va'`. The callable's session lookup
 * is kind-aware, and the module-level cache key includes the kind so a quiz
 * session and a VA session that happen to share an id can't collide.
 */
type LtiSessionKind = 'quiz' | 'va';

interface ResolveNamesResponse {
  names?: Record<string, { givenName?: string; familyName?: string }>;
}

const EMPTY = new Map<string, StudentName>();

let cacheOwnerUid: string | null = null;
let cache = new Map<string, Promise<Map<string, StudentName>>>();

/** Cache key — namespaced by kind so quiz/VA sessions never collide. */
function cacheKey(sessionId: string, kind: LtiSessionKind): string {
  return `${kind}:${sessionId}`;
}

function fetchSessionNames(
  sessionId: string,
  teacherUid: string,
  kind: LtiSessionKind
): Promise<Map<string, StudentName>> {
  if (cacheOwnerUid !== teacherUid) {
    cache = new Map();
    cacheOwnerUid = teacherUid;
  }
  const key = cacheKey(sessionId, kind);
  const cached = cache.get(key);
  if (cached) return cached;

  const callable = httpsCallable<
    { sessionId: string; kind: LtiSessionKind },
    ResolveNamesResponse
  >(functions, 'ltiResolveNamesForAssignmentV1');
  const promise = callable({ sessionId, kind }).then((res) => {
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

  cache.set(key, promise);
  // Evict on failure so a transient CF error doesn't poison the cache forever.
  promise.catch(() => {
    if (cache.get(key) === promise) cache.delete(key);
  });
  return promise;
}

export function useLtiSessionNames(
  sessionId: string | null | undefined,
  enabled: boolean,
  kind: LtiSessionKind = 'quiz'
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
    fetchSessionNames(sessionId, teacherUid, kind)
      .then((map) => {
        if (!cancelled) setResolved({ key: sessionId, map });
      })
      .catch((err) => {
        if (!cancelled)
          logError('useLtiSessionNames.fetch', err, { sessionId, kind });
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, enabled, kind]);

  return resolved.key === sessionId && sessionId ? resolved.map : EMPTY;
}
