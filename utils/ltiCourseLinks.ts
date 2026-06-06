/**
 * ltiCourseLinks — client seam for the Schoology side of Item D ("unify class ↔
 * LMS course"): the callable wrappers for the three linking CFs plus a reverse
 * lookup for showing per-class link state.
 *
 * Schoology has no "list my courses" API, so a section can only be linked AFTER
 * SpartBoard has seen it via an LTI launch. Every call therefore carries the
 * `sessionId` (+ `kind`) the teacher saw the section in — the server's trust
 * anchor (it verifies the caller owns that session and that the session actually
 * saw `contextId`). No OAuth token is involved (unlike Google Classroom): the
 * launch + session ownership IS the proof.
 *
 * The forward link `lti_course_links/{contextId} = { classlinkClassId,
 * teacherUid, … }` is written server-side (linkLtiCourseV1). `findLinkedLti
 * ContextId` queries it BY `classlinkClassId` — a single-field equality, no
 * composite index — and filters to the caller's own links, mirroring
 * `findLinkedClassroomCourseId`.
 */
import { httpsCallable, type Functions } from 'firebase/functions';
import {
  collection,
  getDocs,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';

/** Which SpartBoard runner the seen session targets. */
export type LtiLinkKind = 'quiz' | 'va';

/** Args for `linkLtiCourseV1`. */
export interface LinkLtiCourseArgs {
  /** The Schoology section's LTI `context_id`. */
  contextId: string;
  /** A session the caller owns that SAW this context (trust anchor). */
  sessionId: string;
  kind: LtiLinkKind;
  /** The ClassLink class `sourcedId` to pair the section with. */
  classlinkClassId: string;
  classlinkOrgId?: string;
  /** The SpartBoard roster id, denormalized onto the link for display. */
  rosterId?: string;
}

/** Args for `unlinkLtiCourseV1`. */
export interface UnlinkLtiCourseArgs {
  contextId: string;
  sessionId: string;
  kind: LtiLinkKind;
}

/** Args for `ltiSuggestClassLinkMatchV1`. */
export interface SuggestLtiMatchArgs {
  contextId: string;
  sessionId: string;
  kind: LtiLinkKind;
  /** The teacher's candidate ClassLink classes to overlap-match against. */
  candidates: { classlinkClassId: string }[];
}

/** Result of `ltiSuggestClassLinkMatchV1`. */
export interface SuggestLtiMatchResult {
  /** The best-overlap class, or null when there's nothing to suggest. */
  suggestion: {
    classlinkClassId: string;
    overlap: number;
    ratio: number;
  } | null;
  /** True when a runner-up is within one student (co-taught / cross-listed). */
  ambiguous?: boolean;
  /** Why there's no suggestion (no email released, no overlap, etc.). */
  reason?: string;
  /** How many section members had a usable email (diagnostic). */
  sectionMemberCount?: number;
}

/** Pair a Schoology section to a ClassLink class. */
export async function linkLtiCourse(
  functions: Functions,
  args: LinkLtiCourseArgs
): Promise<{ ok: boolean; contextId: string }> {
  const callable = httpsCallable<
    LinkLtiCourseArgs,
    { ok: boolean; contextId: string }
  >(functions, 'linkLtiCourseV1');
  const { data } = await callable(args);
  return data;
}

/** Remove a Schoology section ↔ class link. */
export async function unlinkLtiCourse(
  functions: Functions,
  args: UnlinkLtiCourseArgs
): Promise<{ ok: boolean; removed: boolean }> {
  const callable = httpsCallable<
    UnlinkLtiCourseArgs,
    { ok: boolean; removed: boolean }
  >(functions, 'unlinkLtiCourseV1');
  const { data } = await callable(args);
  return data;
}

/** Ask the server for the best ClassLink class to pair a section with. */
export async function suggestLtiClassLinkMatch(
  functions: Functions,
  args: SuggestLtiMatchArgs
): Promise<SuggestLtiMatchResult> {
  const callable = httpsCallable<SuggestLtiMatchArgs, SuggestLtiMatchResult>(
    functions,
    'ltiSuggestClassLinkMatchV1'
  );
  const { data } = await callable(args);
  return data;
}

/** Firestore `in` filters accept at most 30 values; chunk defensively. */
const IN_CHUNK = 30;

interface LtiCourseLinkDoc {
  classlinkClassId?: string;
  teacherUid?: string;
}

/**
 * Resolve the single Schoology section (`contextId`) linked to the given
 * ClassLink class(es) for this teacher, or null when there's no unambiguous
 * match (none linked, or several different sections). The doc id IS the
 * contextId. Mirrors `findLinkedClassroomCourseId`.
 */
export async function findLinkedLtiContextId(
  db: Firestore,
  classlinkClassIds: readonly string[],
  teacherUid: string
): Promise<string | null> {
  const ids = [...new Set(classlinkClassIds.filter((c) => !!c))];
  if (ids.length === 0 || !teacherUid) return null;

  const contextIds = new Set<string>();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const snap = await getDocs(
      query(
        collection(db, 'lti_course_links'),
        where('classlinkClassId', 'in', chunk)
      )
    );
    for (const d of snap.docs) {
      const data = d.data() as LtiCourseLinkDoc;
      if (data.teacherUid === teacherUid) contextIds.add(d.id);
    }
  }

  return contextIds.size === 1 ? [...contextIds][0] : null;
}
