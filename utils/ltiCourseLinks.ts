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
 * link). Linking a class replaces its other section links server-side, and the
 * owner can remove a link with `unlinkLtiSection`.
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
): Promise<{ ok: boolean; contextId: string } & ReplacedLinks> {
  const callable = httpsCallable<
    LinkLtiCourseArgs,
    { ok: boolean; contextId: string } & ReplacedLinks
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
): Promise<LinkByUrlResult> {
  const callable = httpsCallable<
    { url: string; rosterId: string },
    LinkByUrlResult
  >(functions, 'ltiLinkSectionByUrlV1');
  const { data } = await callable({ url, rosterId });
  return data;
}

/** The class's earlier section links that a link replaced: titles and section ids. */
export interface ReplacedLinks {
  replaced?: string[];
  replacedIds?: string[];
}

interface LinkByUrlResult extends ReplacedLinks {
  ok: boolean;
  contextId: string;
  contextTitle: string | null;
}

/** Remove one of the caller's own Schoology section links. */
export async function unlinkLtiSection(
  functions: Functions,
  contextId: string
): Promise<{ ok: boolean; contextId: string }> {
  const callable = httpsCallable<
    { contextId: string },
    { ok: boolean; contextId: string }
  >(functions, 'ltiUnlinkSectionV1');
  const { data } = await callable({ contextId });
  return data;
}

/** " Replaced …" for a link toast, or "" when nothing was replaced. */
export function replacedNote(replaced: string[] | undefined): string {
  if (!replaced || replaced.length === 0) return '';
  return ` Replaced ${replaced.map((t) => `“${t}”`).join(', ')}.`;
}

/** How a class stands against the Schoology section its SIS id points at. */
export type FoundSectionStatus =
  'ready' | 'linked' | 'none' | 'taken' | 'not-teacher' | 'error';

/** One of the caller's ClassLink classes and its Schoology section. */
export interface FoundSectionRow extends ReplacedLinks {
  rosterId: string;
  status: FoundSectionStatus;
  contextId?: string;
  contextTitle?: string | null;
  periodTitle?: string | null;
  /** The section a link would replace for this class. */
  replacesTitle?: string | null;
  error?: string;
}

/** Find the Schoology section for each of the caller's ClassLink classes. */
export async function findSchoologySections(
  functions: Functions
): Promise<FoundSectionRow[]> {
  const callable = httpsCallable<
    Record<string, never>,
    { rows: FoundSectionRow[] }
  >(functions, 'ltiFindSchoologySectionsV1');
  const { data } = await callable({});
  return data.rows;
}

/** Link these classes to the sections found for them; returns each class's outcome. */
export async function linkFoundSchoologySections(
  functions: Functions,
  rosterIds: string[]
): Promise<FoundSectionRow[]> {
  const callable = httpsCallable<
    { rosterIds: string[] },
    { rows: FoundSectionRow[] }
  >(functions, 'ltiFindSchoologySectionsV1');
  const { data } = await callable({ rosterIds });
  return data.rows;
}
