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
  classlinkClassId?: string;
  /** Or an admin test-class slug (mock ClassLink); exactly one of the two. */
  testClassId?: string;
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

/** One of the caller's classes that shares students with a pasted Schoology course. */
export interface LtiSectionByUrlSuggestion {
  rosterId: string;
  overlap: number;
}

/** Result of `ltiLinkSectionByUrlV1` called with only a URL. */
export interface LtiSectionByUrlPreview {
  contextId: string;
  contextTitle: string | null;
  learnerCount: number;
  /** The caller's classes with any shared students, most first. */
  suggestions: LtiSectionByUrlSuggestion[];
  /** The roster this section is already linked to, if the caller linked it before. */
  linkedRosterId: string | null;
}

/** Check a pasted Schoology course link and rank the caller's classes against it. */
export async function previewLtiSectionByUrl(
  functions: Functions,
  url: string
): Promise<LtiSectionByUrlPreview> {
  const callable = httpsCallable<{ url: string }, LtiSectionByUrlPreview>(
    functions,
    'ltiLinkSectionByUrlV1'
  );
  const { data } = await callable({ url });
  return data;
}

/** Link a pasted Schoology course to one of the caller's ClassLink rosters. */
export async function linkLtiSectionByUrl(
  functions: Functions,
  url: string,
  rosterId: string
): Promise<{ ok: boolean; contextId: string; contextTitle: string | null }> {
  const callable = httpsCallable<
    { url: string; rosterId: string },
    { ok: boolean; contextId: string; contextTitle: string | null }
  >(functions, 'ltiLinkSectionByUrlV1');
  const { data } = await callable({ url, rosterId });
  return data;
}
