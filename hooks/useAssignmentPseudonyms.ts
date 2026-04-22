/**
 * useAssignmentPseudonyms — teacher-side name resolution for ClassLink
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
 * The callable is only invoked when `classId` is non-empty (i.e. the
 * assignment was targeted to a ClassLink class). Unmatched ids in the
 * reverse maps mean the submitting student arrived via the legacy code+PIN
 * flow — callers should fall back to their existing PIN / anonymous label.
 *
 * Module-level Promise-valued cache so sibling viewers (e.g. AssignmentsModal
 * opening a row-level modal) de-dupe the round trip. Cache is invalidated
 * when the authenticated teacher uid changes.
 */

import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/config/firebase';

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

function cacheKey(assignmentId: string, classId: string): string {
  return `${assignmentId}::${classId}`;
}

function fetchPseudonymMaps(
  assignmentId: string,
  classId: string,
  teacherUid: string
): Promise<AssignmentPseudonymMaps> {
  if (cacheOwnerUid !== teacherUid) {
    cache = new Map();
    cacheOwnerUid = teacherUid;
  }
  const key = cacheKey(assignmentId, classId);
  const cached = cache.get(key);
  if (cached) return cached;

  const callable = httpsCallable<
    { assignmentId: string; classId: string },
    CallableResponse
  >(functions, 'getPseudonymsForAssignmentV1');

  const promise = callable({ assignmentId, classId }).then((res) => {
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

interface ResolvedMaps {
  key: string;
  maps: AssignmentPseudonymMaps;
}

function pairKey(
  assignmentId: string | null | undefined,
  classId: string | null | undefined
): string {
  return assignmentId && classId ? `${assignmentId}::${classId}` : '';
}

export function useAssignmentPseudonyms(
  assignmentId: string | null | undefined,
  classId: string | null | undefined
): AssignmentPseudonymMaps {
  const [resolved, setResolved] = useState<ResolvedMaps>({
    key: '',
    maps: EMPTY_MAPS,
  });

  useEffect(() => {
    const key = pairKey(assignmentId, classId);
    if (!key || !assignmentId || !classId) return;
    const teacherUid = auth.currentUser?.uid ?? '';
    if (!teacherUid) return;
    let cancelled = false;
    fetchPseudonymMaps(assignmentId, classId, teacherUid)
      .then((maps) => {
        if (!cancelled) setResolved({ key, maps });
      })
      .catch((err) => {
        console.warn('[useAssignmentPseudonyms] Name resolution failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [assignmentId, classId]);

  const currentKey = pairKey(assignmentId, classId);
  return resolved.key === currentKey && currentKey !== ''
    ? resolved.maps
    : EMPTY_MAPS;
}

export function formatStudentName(name: StudentName | undefined): string {
  if (!name) return '';
  const full = `${name.givenName} ${name.familyName}`.trim();
  return full;
}

/**
 * Multi-class variant of `useAssignmentPseudonyms` for sessions targeted to
 * more than one ClassLink class (currently just mini-app sessions, which
 * store `classIds: string[]`). Fetches the pseudonym map per classId and
 * merges the results into a single pair of reverse maps. A student enrolled
 * in multiple selected classes will resolve to the same name from either.
 */
export function useAssignmentPseudonymsMulti(
  assignmentId: string | null | undefined,
  classIds: readonly string[] | null | undefined
): AssignmentPseudonymMaps {
  // `classIdsKey` is the canonical, value-stable identity for the caller's
  // class list. Deriving it from the raw prop (instead of from a pre-filtered
  // array) lets the effect depend on just `[assignmentId, classIdsKey]`
  // without an exhaustive-deps suppression — the effect itself re-derives
  // the cleaned list from `classIdsKey`.
  const classIdsKey = (classIds ?? [])
    .filter((c): c is string => typeof c === 'string' && c.length > 0)
    .slice()
    .sort()
    .join('|');
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
    const key = `${assignmentId}::${classIdsKey}`;
    Promise.all(
      cleanedInEffect.map((cid) =>
        fetchPseudonymMaps(assignmentId, cid, teacherUid)
      )
    )
      .then((all) => {
        if (cancelled) return;
        const byStudentUid = new Map<string, StudentName>();
        const byAssignmentPseudonym = new Map<string, StudentName>();
        for (const maps of all) {
          for (const [k, v] of maps.byStudentUid) byStudentUid.set(k, v);
          for (const [k, v] of maps.byAssignmentPseudonym)
            byAssignmentPseudonym.set(k, v);
        }
        setResolved({ key, maps: { byStudentUid, byAssignmentPseudonym } });
      })
      .catch((err) => {
        console.warn(
          '[useAssignmentPseudonymsMulti] Name resolution failed:',
          err
        );
      });
    return () => {
      cancelled = true;
    };
  }, [assignmentId, classIdsKey]);

  const currentKey =
    assignmentId && classIdsKey.length > 0
      ? `${assignmentId}::${classIdsKey}`
      : '';
  return resolved.key === currentKey && currentKey !== ''
    ? resolved.maps
    : EMPTY_MAPS;
}
