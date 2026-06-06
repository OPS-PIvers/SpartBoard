/**
 * ltiCourseLinks — client seam for the Schoology side of Item D ("unify class ↔
 * LMS course"): the callable wrappers for the linking CFs.
 *
 * Schoology has no "list my courses" API, so a section can only be linked AFTER
 * SpartBoard has seen it via an LTI launch. Every call therefore carries the
 * `sessionId` (+ `kind`) the teacher saw the section in — the server's trust
 * anchor (it verifies the caller owns that session and that the session actually
 * saw `contextId`). No OAuth token is involved (unlike Google Classroom): the
 * launch + session ownership IS the proof.
 *
 * Per-class link state is read from the roster's mirrored `ltiContextId` (set on
 * link), so there is no client reverse-lookup here; and a mis-link is corrected
 * by re-linking (the server lets the same teacher re-point their own link), so
 * there is no unlink wrapper.
 */
import { httpsCallable, type Functions } from 'firebase/functions';

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
