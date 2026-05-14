/**
 * useAssignmentPseudonymsMulti — teacher-side name resolution for ClassLink
 * students.
 *
 * Calls `getPseudonymsForAssignmentV1` once per (assignmentId, classId) pair
 * and returns two reverse maps so grading viewers can render student names
 * regardless of which pseudonym their response docs are keyed by:
 *
 *   - `byStudentUid`           — keyed by HMAC(sourcedId). Matches Firestore
 *                                docs that use `auth.currentUser.uid` as the
 *                                doc ID (quiz, video-activity, guided-
 *                                learning responses).
 *   - `byAssignmentPseudonym`  — keyed by HMAC(studentUid + assignmentId).
 *                                Matches Firestore docs that use a per-
 *                                assignment opaque id as the doc ID (mini-
 *                                app submissions).
 *
 * The callable is only invoked when a classId is non-empty (i.e. the
 * assignment was targeted to a ClassLink class). Unmatched ids in the
 * reverse maps mean the submitting student arrived via the legacy code+PIN
 * flow — callers should fall back to their existing PIN / anonymous label.
 *
 * Module-level Promise-valued cache so sibling viewers (e.g. AssignmentsModal
 * opening a row-level modal) de-dupe the round trip. Cache is invalidated
 * when the authenticated teacher uid changes.
 */

import { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/config/firebase';
import { logError } from '@/utils/logError';

export interface StudentName {
  givenName: string;
  familyName: string;
}

export interface AssignmentPseudonymMaps {
  byStudentUid: Map<string, StudentName>;
  byAssignmentPseudonym: Map<string, StudentName>;
}

interface CallableResponse {
  pseudonyms?: Record<
    string,
    {
      studentUid?: string;
      assignmentPseudonym?: string;
      givenName?: string;
      familyName?: string;
    }
  >;
}

const EMPTY_MAPS: AssignmentPseudonymMaps = {
  byStudentUid: new Map(),
  byAssignmentPseudonym: new Map(),
};

let cacheOwnerUid: string | null = null;
let cache: Map<string, Promise<AssignmentPseudonymMaps>> = new Map();

function cacheKey(
  assignmentId: string,
  classId: string,
  orgId: string
): string {
  // orgId is part of the key so a teacher who belongs to multiple orgs
  // doesn't get a cached test-class result from the wrong org. For ClassLink
  // classes (no test-class doc under any org) the lookup result is identical
  // regardless of orgId, so the duplicate cache cost is negligible.
  return `${assignmentId}::${classId}::${orgId}`;
}

function fetchPseudonymMaps(
  assignmentId: string,
  classId: string,
  orgId: string,
  teacherUid: string
): Promise<AssignmentPseudonymMaps> {
  if (cacheOwnerUid !== teacherUid) {
    cache = new Map();
    cacheOwnerUid = teacherUid;
  }
  const key = cacheKey(assignmentId, classId, orgId);
  const cached = cache.get(key);
  if (cached) return cached;

  const callable = httpsCallable<
    { assignmentId: string; classId: string; orgId?: string },
    CallableResponse
  >(functions, 'getPseudonymsForAssignmentV1');

  const promise = callable(
    orgId ? { assignmentId, classId, orgId } : { assignmentId, classId }
  ).then((res) => {
    const entries = res.data?.pseudonyms ?? {};
    const byStudentUid = new Map<string, StudentName>();
    const byAssignmentPseudonym = new Map<string, StudentName>();
    for (const v of Object.values(entries)) {
      const name: StudentName = {
        givenName: v.givenName ?? '',
        familyName: v.familyName ?? '',
      };
      if (v.studentUid) byStudentUid.set(v.studentUid, name);
      if (v.assignmentPseudonym)
        byAssignmentPseudonym.set(v.assignmentPseudonym, name);
    }
    return { byStudentUid, byAssignmentPseudonym };
  });

  cache.set(key, promise);
  promise.catch(() => {
    if (cache.get(key) === promise) cache.delete(key);
  });

  return promise;
}

export function formatStudentName(name: StudentName | undefined): string {
  if (!name) return '';
  const full = `${name.givenName} ${name.familyName}`.trim();
  return full;
}

/**
 * Resolve pseudonym maps for a session targeted to one or more ClassLink
 * classes. Pass a single-element array for single-class sessions; pass the
 * session's `classIds` array for multi-class. Fetches the pseudonym map per
 * classId and merges results into a single pair of reverse maps. A student
 * enrolled in multiple selected classes resolves to the same name from
 * either.
 *
 * Per-class fetches run under `Promise.allSettled` so one failing classId
 * (403, transient CF error) does not zero out the whole map — partial
 * resolution is strictly better than zero. Failed classIds are reported
 * via `logError`.
 */
export function useAssignmentPseudonymsMulti(
  assignmentId: string | null | undefined,
  classIds: readonly string[] | null | undefined,
  orgId: string | null | undefined
): AssignmentPseudonymMaps {
  // `classIdsKey` is the canonical, value-stable identity for the caller's
  // class list. Deriving it as a memo lets the effect depend on just
  // `[assignmentId, classIdsKey, orgKey]` without re-running for unchanged
  // identity. The effect itself re-derives the cleaned list from the key.
  const classIdsKey = useMemo(
    () =>
      (classIds ?? [])
        .filter((c): c is string => typeof c === 'string' && c.length > 0)
        .slice()
        .sort()
        .join('|'),
    [classIds]
  );
  const orgKey = orgId ?? '';
  const [resolved, setResolved] = useState<{
    key: string;
    maps: AssignmentPseudonymMaps;
  }>({ key: '', maps: EMPTY_MAPS });

  useEffect(() => {
    if (!assignmentId || classIdsKey.length === 0) return;
    const teacherUid = auth.currentUser?.uid ?? '';
    if (!teacherUid) return;
    const cleanedInEffect = classIdsKey.split('|');
    let cancelled = false;
    const key = `${assignmentId}::${classIdsKey}::${orgKey}`;
    // `Promise.allSettled` (not `Promise.all`) so a single classId's lookup
    // failing — 403 from a revoked share, transient CF unavailability, etc.
    // — must not zero out the entire map. Partial resolution is strictly
    // better than zero; downstream consumers fall back to PIN / 'Student'
    // for unresolved uids.
    Promise.allSettled(
      cleanedInEffect.map((cid) =>
        fetchPseudonymMaps(assignmentId, cid, orgKey, teacherUid)
      )
    )
      .then((results) => {
        if (cancelled) return;
        const byStudentUid = new Map<string, StudentName>();
        const byAssignmentPseudonym = new Map<string, StudentName>();
        results.forEach((res, i) => {
          if (res.status === 'fulfilled') {
            for (const [k, v] of res.value.byStudentUid) byStudentUid.set(k, v);
            for (const [k, v] of res.value.byAssignmentPseudonym)
              byAssignmentPseudonym.set(k, v);
          } else {
            logError('useAssignmentPseudonymsMulti.fetchPerClass', res.reason, {
              assignmentId,
              classId: cleanedInEffect[i],
            });
          }
        });
        setResolved({ key, maps: { byStudentUid, byAssignmentPseudonym } });
      })
      .catch((err) => {
        // `allSettled` itself can't reject, but the `.then` handler body
        // can throw (non-iterable shape drift in `byStudentUid`, an error
        // inside `logError`, a `setResolved` race during unmount). Without
        // this `.catch`, that becomes a global `unhandledrejection` and
        // the viewer is stuck on empty maps forever with no signal.
        if (cancelled) return;
        logError('useAssignmentPseudonymsMulti.processResults', err, {
          assignmentId,
          classIdsKey,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [assignmentId, classIdsKey, orgKey]);

  const currentKey =
    assignmentId && classIdsKey.length > 0
      ? `${assignmentId}::${classIdsKey}::${orgKey}`
      : '';
  return resolved.key === currentKey && currentKey !== ''
    ? resolved.maps
    : EMPTY_MAPS;
}
