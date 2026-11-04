// Schoology LTI 1.3 — class↔course linking (Item D part 2, Schoology side).
//
//   linkLtiCourseV1            — pair a Schoology section (contextId) to a
//                                ClassLink class, mirroring linkClassroomCourse.
//                                A same-teacher re-link re-points it, and
//                                the class's other section links are dropped.
//                                A co-teacher NRPS lists as Instructor gets
//                                their own link (courseLinkStore.ts).
//   ltiUnlinkSectionV1         — the owner removes one of their own links.
//   ltiSuggestClassLinkMatchV1 — best-effort auto-match: overlap a section's
//                                NRPS roster emails with the teacher's ClassLink
//                                rosters and suggest the best class. Email is
//                                read TRANSIENTLY (never returned, never stored).
//
// Schoology has no "list my courses" API, so unlike Google Classroom the tool
// only "meets" a section when someone launches into it. The TRUST ANCHOR for all
// three callables is therefore session-context ownership: the caller must own a
// SpartBoard session that has ACTUALLY SEEN this contextId (its per-context
// membership doc, written server-side on launch, exists). This is the LTI
// analogue of `verifyTeacherOfCourse` — rules can't validate an LTI launch, so
// this server gate is the squat protection (no client write; no claiming a
// foreign context_id).
//
// `lti_course_links/{contextId}` is server-write-only (firestore.rules) and was
// an empty rules home until now — these are its first writers, so the change is
// purely additive and does not touch the live launch/AGS/NRPS paths.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from '../firebaseAdmin';

import { getLtiPlatformConfig, NRPS_SCOPE } from './config';
import { ALLOWED_ORIGINS } from '../classlinkShared';
import { getAgsAccessToken } from './ags';
import { fetchNrpsMembers } from './nrps';
import {
  QUIZ_SESSIONS_COLLECTION,
  VIDEO_ACTIVITY_SESSIONS_COLLECTION,
  LTI_SESSION_MEMBERSHIPS_COLLECTION,
  LTI_SEEN_SECTIONS_SUBCOLLECTION,
  USERS_COLLECTION,
  dropLinkedSectionPeriod,
  type LtiSessionKind,
  contextOwnedBy,
} from './nrpsStore';
// Reuse the existing OneRoster seam (and its test-spy point) rather than
// re-implementing the signed fetch. fetchClassStudents takes the creds as args.
import { classroomAddonNet } from '../classroomAddonAuth';
import { assertViewAsAllowed } from '../viewAsGuard';
import { isDistrictTeacher } from './teacherAuth';
import { schoologySectionUrls } from './lineItems';
import {
  LTI_COURSE_LINKS_COLLECTION,
  deleteTeacherLink,
  isActiveInstructor,
  linkContextId,
  promoteCoTeacherLink,
  writeTeacherLink,
} from './courseLinkStore';

export { LTI_COURSE_LINKS_COLLECTION } from './courseLinkStore';

/** The class a link points at; any one matching id makes two links the same class. */
export interface LinkedClass {
  rosterId: string | null;
  classlinkClassId: string | null;
  testClassId: string | null;
}

export function linksSameClass(
  link: Record<string, unknown>,
  cls: LinkedClass
): boolean {
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v ? v : null;
  return (
    (!!cls.rosterId && str(link.rosterId) === cls.rosterId) ||
    (!!cls.classlinkClassId &&
      str(link.classlinkClassId) === cls.classlinkClassId) ||
    (!!cls.testClassId && str(link.testClassId) === cls.testClassId)
  );
}

export interface ReplacedLinks {
  /** Titles of the deleted links, for the toast. */
  replaced: string[];
  /** Section ids of the deleted links, so clients clear any roster still mirroring one. */
  replacedIds: string[];
}

/** One Schoology section per class: best-effort delete of the teacher's other links to `cls`. */
export async function dropOtherLinksForClass(
  db: admin.firestore.Firestore,
  teacherUid: string,
  keepContextId: string,
  cls: LinkedClass
): Promise<ReplacedLinks> {
  try {
    const snap = await db
      .collection(LTI_COURSE_LINKS_COLLECTION)
      .where('teacherUid', '==', teacherUid)
      .get();
    const stale = snap.docs.filter(
      (d) =>
        linkContextId(d.id, d.data()) !== keepContextId &&
        linksSameClass(d.data(), cls)
    );
    if (stale.length === 0) return { replaced: [], replacedIds: [] };
    const batch = db.batch();
    for (const d of stale) batch.delete(d.ref);
    await batch.commit();
    for (const d of stale) {
      if (d.id === linkContextId(d.id, d.data())) {
        await promoteCoTeacherLink(db, d.id).catch((err: unknown) =>
          console.warn('[lti] promoting a co-teacher link failed', err)
        );
      }
    }
    return {
      replaced: stale.map((d) => {
        const t = d.data().contextTitle as unknown;
        return typeof t === 'string' && t ? t : 'a Schoology section';
      }),
      replacedIds: stale.map((d) => linkContextId(d.id, d.data())),
    };
  } catch (err) {
    console.warn('[lti] dropping replaced course links failed', err);
    return { replaced: [], replacedIds: [] };
  }
}

/** Cap on candidate classes a single suggest call will OneRoster-fetch. */
const MAX_MATCH_CANDIDATES = 60;

// Secrets are keyed by NAME, so re-defining here (the canonical defs live in
// classroomAddonAuth.ts / serviceEndpoints.ts) binds the same values.
const LTI_TOOL_PRIVATE_KEY = defineSecret('LTI_TOOL_PRIVATE_KEY');
const CLASSLINK_CLIENT_ID = defineSecret('CLASSLINK_CLIENT_ID');
const CLASSLINK_CLIENT_SECRET = defineSecret('CLASSLINK_CLIENT_SECRET');
const CLASSLINK_TENANT_URL = defineSecret('CLASSLINK_TENANT_URL');

/** The Firestore session collection a launch `kind` targets. */
function sessionCollectionForKind(kind: LtiSessionKind): string {
  return kind === 'va'
    ? VIDEO_ACTIVITY_SESSIONS_COLLECTION
    : QUIZ_SESSIONS_COLLECTION;
}

/** What the trust-anchor check returns for the caller to reuse. */
interface SeenContext {
  /** The section title captured at launch (display/recognition), or null. */
  contextTitle: string | null;
  /** The NRPS membership URL captured at launch, or null. */
  membershipUrl: string | null;
}

/**
 * TRUST ANCHOR. Throws unless the caller (a) owns the session and (b) the
 * session has actually seen `contextId` — proven by the per-context membership
 * doc written server-side on launch. Returns the captured title + NRPS URL so
 * callers don't re-read the doc. Same opaque error for "no session" and "not
 * your session" so session existence isn't revealed.
 */
async function assertOwnsSchoologyContext(
  db: admin.firestore.Firestore,
  callerUid: string,
  sessionId: string,
  kind: LtiSessionKind,
  contextId: string
): Promise<SeenContext> {
  const sessSnap = await db
    .collection(sessionCollectionForKind(kind))
    .doc(sessionId)
    .get();
  const sessTeacherUid =
    typeof sessSnap.data()?.teacherUid === 'string'
      ? (sessSnap.data()?.teacherUid as string)
      : '';
  if (!sessSnap.exists)
    await rejectStaleSeenSection(db, callerUid, sessionId, contextId);
  if (!sessSnap.exists || sessTeacherUid !== callerUid) {
    throw new HttpsError(
      'permission-denied',
      'Not the teacher of this session.'
    );
  }

  const ctxSnap = await db
    .collection(LTI_SESSION_MEMBERSHIPS_COLLECTION)
    .doc(sessionId)
    .collection('contexts')
    .doc(contextId)
    .get();
  if (!ctxSnap.exists) {
    throw new HttpsError(
      'permission-denied',
      'This Schoology section has not been seen in this session.'
    );
  }
  const cd = ctxSnap.data() ?? {};
  // A context filed under a previous owner of a recycled session id is not this caller's.
  if (
    !(await contextOwnedBy(
      db,
      sessionId,
      sessSnap.data() ?? {},
      contextId,
      cd,
      callerUid
    ))
  ) {
    throw new HttpsError(
      'permission-denied',
      'This Schoology section has not been seen in this session.'
    );
  }
  return {
    contextTitle: typeof cd.contextTitle === 'string' ? cd.contextTitle : null,
    membershipUrl:
      typeof cd.contextMembershipsUrl === 'string'
        ? cd.contextMembershipsUrl
        : null,
  };
}

/**
 * The caller's own seen-section record can outlive its anchor session (the
 * assignment was deleted). Only when THAT record names this sessionId — so a
 * probe with a random id learns nothing — drop it (the nudge stops counting it)
 * and say plainly that a relaunch is needed.
 */
async function rejectStaleSeenSection(
  db: admin.firestore.Firestore,
  callerUid: string,
  sessionId: string,
  contextId: string
): Promise<void> {
  const seenRef = db
    .collection(USERS_COLLECTION)
    .doc(callerUid)
    .collection(LTI_SEEN_SECTIONS_SUBCOLLECTION)
    .doc(contextId);
  const seen = await seenRef.get();
  if (!seen.exists || seen.data()?.sessionId !== sessionId) return;
  await seenRef.delete();
  throw new HttpsError(
    'failed-precondition',
    'That launch record is out of date. Open the assignment from Schoology again, then link it.'
  );
}

/** Require an authed, verified district teacher; return their uid. */
async function requireTeacher(request: {
  auth?: {
    uid: string;
    token: { email?: string; email_verified?: boolean; studentRole?: unknown };
  };
}): Promise<string> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  if (!(await isDistrictTeacher(request.auth.token))) {
    throw new HttpsError('permission-denied', 'Teacher account required.');
  }
  return request.auth.uid;
}

// Firestore-id / sourcedId shape. Applied to ids that flow into a `.doc()` path
// (contextId, sessionId) so a slash-bearing value can't escape its collection
// (path-segment injection) or surface as an opaque 500.
const ID_RE = /^[A-Za-z0-9:_.-]{1,256}$/;

/**
 * Parse the runner `kind`, rejecting a present-but-unrecognized value instead of
 * silently coercing it to 'quiz' (which would point the trust anchor at the
 * wrong collection and yield a confusing "not the teacher" error). Absent → quiz
 * (the common default), matching the callers that omit it.
 */
function parseKind(kind: unknown): LtiSessionKind {
  if (kind === undefined || kind === 'quiz') return 'quiz';
  if (kind === 'va') return 'va';
  throw new HttpsError('invalid-argument', "kind must be 'quiz' or 'va'.");
}

/**
 * The class ids the caller's OWN rosters carry — ClassLink ids and admin
 * test-class slugs separately. Used to ensure a teacher can only act on their
 * own classes — both when persisting a link and when overlap-matching — so a
 * caller can't bind/fetch a foreign class id.
 */
async function ownedClassIds(
  db: admin.firestore.Firestore,
  callerUid: string
): Promise<{ classlink: Set<string>; test: Set<string> }> {
  const snap = await db
    .collection(USERS_COLLECTION)
    .doc(callerUid)
    .collection('rosters')
    .get();
  const classlink = new Set<string>();
  const test = new Set<string>();
  for (const d of snap.docs) {
    const data = d.data() as {
      classlinkClassId?: unknown;
      testClassId?: unknown;
    };
    if (typeof data.classlinkClassId === 'string' && data.classlinkClassId) {
      classlink.add(data.classlinkClassId);
    }
    if (typeof data.testClassId === 'string' && data.testClassId) {
      test.add(data.testClassId);
    }
  }
  return { classlink, test };
}

async function ownedClasslinkClassIds(
  db: admin.firestore.Firestore,
  callerUid: string
): Promise<Set<string>> {
  return (await ownedClassIds(db, callerUid)).classlink;
}

/** Whether NRPS lists `email` as an active Instructor of the section; false on any failure. */
async function callerTeachesSection(
  db: admin.firestore.Firestore,
  email: string | undefined,
  membershipUrl: string
): Promise<boolean> {
  if (!email) return false;
  try {
    const cfg = await getLtiPlatformConfig(db);
    const token = await getAgsAccessToken({
      clientId: cfg.clientId,
      tokenUrl: cfg.tokenUrl,
      privatePem: LTI_TOOL_PRIVATE_KEY.value(),
      scopes: [NRPS_SCOPE],
    });
    return isActiveInstructor(
      await fetchNrpsMembers(membershipUrl, token),
      email
    );
  } catch (err) {
    console.warn('[linkLtiCourse] co-teacher NRPS check failed:', err);
    return false;
  }
}

// ── linkLtiCourseV1 ─────────────────────────────────────────────────────────
export const linkLtiCourseV1 = onCall(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
    secrets: [LTI_TOOL_PRIVATE_KEY],
  },
  async (request) => {
    assertViewAsAllowed(request);
    const callerUid = await requireTeacher(request);
    const data = (request.data ?? {}) as {
      contextId?: unknown;
      sessionId?: unknown;
      kind?: unknown;
      classlinkClassId?: unknown;
      testClassId?: unknown;
      classlinkOrgId?: unknown;
      rosterId?: unknown;
    };
    const contextId = typeof data.contextId === 'string' ? data.contextId : '';
    const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
    const kind = parseKind(data.kind);
    const classlinkClassId =
      typeof data.classlinkClassId === 'string' ? data.classlinkClassId : '';
    // Admin test classes (mock ClassLink) link too, so the LTI flow is testable end to end.
    const testClassId =
      typeof data.testClassId === 'string' ? data.testClassId : '';
    if (
      !ID_RE.test(contextId) ||
      !ID_RE.test(sessionId) ||
      (!classlinkClassId && !testClassId) ||
      (classlinkClassId && testClassId)
    ) {
      throw new HttpsError(
        'invalid-argument',
        'contextId, sessionId, and exactly one of classlinkClassId or testClassId are required.'
      );
    }
    const classlinkOrgId =
      typeof data.classlinkOrgId === 'string' ? data.classlinkOrgId : null;
    const rosterId = typeof data.rosterId === 'string' ? data.rosterId : null;

    const db = admin.firestore();
    const { contextTitle, membershipUrl } = await assertOwnsSchoologyContext(
      db,
      callerUid,
      sessionId,
      kind,
      contextId
    );

    // The class id is client-supplied; verify it's one of the caller's OWN
    // classes so a teacher can't bind a foreign class id into a section link
    // (which downstream name-resolution would then OneRoster-fetch).
    const owned = await ownedClassIds(db, callerUid);
    if (classlinkClassId && !owned.classlink.has(classlinkClassId)) {
      throw new HttpsError(
        'permission-denied',
        'You can only link one of your own ClassLink classes.'
      );
    }
    if (testClassId && !owned.test.has(testClassId)) {
      throw new HttpsError(
        'permission-denied',
        'You can only link one of your own test classes.'
      );
    }

    // A section another teacher linked gets the caller's own link only when Schoology lists them as its teacher.
    const owner = (
      await db.collection(LTI_COURSE_LINKS_COLLECTION).doc(contextId).get()
    ).data()?.teacherUid as unknown;
    const coTeacher =
      typeof owner === 'string' &&
      !!owner &&
      owner !== callerUid &&
      (await callerTeachesSection(
        db,
        request.auth?.token.email,
        membershipUrl ?? schoologySectionUrls(contextId).membershipUrl
      ));
    const linkedTitle = await writeTeacherLink(
      db,
      callerUid,
      contextId,
      {
        // A test link stores classlinkClassId: null so the identity bridge skips it.
        classlinkClassId: classlinkClassId || null,
        testClassId: testClassId || null,
        classlinkOrgId,
        rosterId,
        contextTitle,
      },
      coTeacher
    );

    const replaced = await dropOtherLinksForClass(db, callerUid, contextId, {
      rosterId,
      classlinkClassId: classlinkClassId || null,
      testClassId: testClassId || null,
    });

    // Best-effort: the section now IS the paired class, so stop counting its title as a second class.
    try {
      await dropLinkedSectionPeriod(db, {
        kind,
        sessionId,
        contextId,
        contextTitle: linkedTitle,
        // Test rosters put their slug on the session's classIds, so it pairs the same way.
        classlinkClassId: classlinkClassId || testClassId,
        rosterId,
      });
    } catch (err) {
      console.warn('[linkLtiCourse] period dedupe failed (non-fatal)', err);
    }

    return { ok: true, contextId, ...replaced };
  }
);

// ── ltiUnlinkSectionV1 ──────────────────────────────────────────────────────
// A teacher removes only their own link; a co-teacher's link of the same section stays.
export const ltiUnlinkSectionV1 = onCall(
  { region: 'us-central1', invoker: 'public', cors: ALLOWED_ORIGINS },
  async (request) => {
    assertViewAsAllowed(request);
    const callerUid = await requireTeacher(request);
    const data = (request.data ?? {}) as { contextId?: unknown };
    const contextId = typeof data.contextId === 'string' ? data.contextId : '';
    if (!ID_RE.test(contextId)) {
      throw new HttpsError('invalid-argument', 'contextId is required.');
    }
    if (!(await deleteTeacherLink(admin.firestore(), callerUid, contextId))) {
      throw new HttpsError(
        'permission-denied',
        'Only the teacher who linked this Schoology section can unlink it.'
      );
    }
    return { ok: true, contextId };
  }
);

// ── ltiSuggestClassLinkMatchV1 ──────────────────────────────────────────────
//
// Best-effort auto-match for the linking UI. Overlaps the section's NRPS roster
// emails with each candidate ClassLink class's OneRoster emails and returns the
// class with the highest overlap. Emails are fetched TRANSIENTLY on both sides
// (NRPS membership + OneRoster roster) and never returned or persisted — only
// the winning classlinkClassId + counts come back. A null suggestion (no email
// released, no overlap, ClassLink not configured) is a normal outcome: the UI
// falls back to a title-based manual pick.
interface MatchSuggestion {
  classlinkClassId: string;
  /** Number of section emails also present in the class roster. */
  overlap: number;
  /** overlap / min(rosterEmails, sectionEmails) — 0..1. */
  ratio: number;
}

export const ltiSuggestClassLinkMatchV1 = onCall(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
    secrets: [
      LTI_TOOL_PRIVATE_KEY,
      CLASSLINK_CLIENT_ID,
      CLASSLINK_CLIENT_SECRET,
      CLASSLINK_TENANT_URL,
    ],
  },
  async (request) => {
    assertViewAsAllowed(request, { read: true });
    const callerUid = await requireTeacher(request);
    const data = (request.data ?? {}) as {
      contextId?: unknown;
      sessionId?: unknown;
      kind?: unknown;
      candidates?: unknown;
    };
    const contextId = typeof data.contextId === 'string' ? data.contextId : '';
    const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
    const kind = parseKind(data.kind);
    if (!ID_RE.test(contextId) || !ID_RE.test(sessionId)) {
      throw new HttpsError(
        'invalid-argument',
        'contextId and sessionId are required.'
      );
    }
    // The teacher's candidate ClassLink classes (their own rosters). Bounded so
    // a single call can't fan out into an unbounded number of OneRoster fetches.
    const candidates = (Array.isArray(data.candidates) ? data.candidates : [])
      .map((c) => {
        const o = (c ?? {}) as { classlinkClassId?: unknown };
        return typeof o.classlinkClassId === 'string' ? o.classlinkClassId : '';
      })
      .filter((id) => id.length > 0)
      .slice(0, MAX_MATCH_CANDIDATES);
    if (candidates.length === 0) {
      throw new HttpsError(
        'invalid-argument',
        'candidates must be a non-empty array of ClassLink class ids.'
      );
    }

    const db = admin.firestore();
    const { membershipUrl } = await assertOwnsSchoologyContext(
      db,
      callerUid,
      sessionId,
      kind,
      contextId
    );
    if (!membershipUrl) {
      return { suggestion: null, reason: 'no-membership-url' as const };
    }

    // Defense-in-depth: only OneRoster-fetch classes the caller actually OWNS.
    // The candidate list is client-supplied; without this a teacher could drive
    // arbitrary roster fetches against the shared org ClassLink credential by
    // passing foreign class ids. (The response only ever returns an overlap
    // COUNT against the caller's own section, so this is abuse-surface hardening,
    // not a privacy fix.) We intersect against the teacher's own rosters.
    const ownedClassIds = await ownedClasslinkClassIds(db, callerUid);
    const ownedCandidates = candidates.filter((c) => ownedClassIds.has(c));
    if (ownedCandidates.length === 0) {
      return { suggestion: null, reason: 'no-owned-candidates' as const };
    }

    // 1. Section roster emails (NRPS, transient).
    const cfg = await getLtiPlatformConfig(db);
    let nrpsToken: string;
    try {
      nrpsToken = await getAgsAccessToken({
        clientId: cfg.clientId,
        tokenUrl: cfg.tokenUrl,
        privatePem: LTI_TOOL_PRIVATE_KEY.value(),
        scopes: [NRPS_SCOPE],
      });
    } catch (err) {
      // Consistent with the function's contract that a null suggestion is a
      // normal outcome (the UI falls back to a manual pick) — a Schoology token
      // blip degrades gracefully rather than surfacing a red error toast.
      console.error('[ltiSuggestMatch] NRPS token mint failed:', err);
      return { suggestion: null, reason: 'nrps-token-failed' as const };
    }
    let sectionEmails: Set<string>;
    try {
      const members = await fetchNrpsMembers(membershipUrl, nrpsToken);
      sectionEmails = new Set(members.map((m) => m.email).filter((e) => !!e));
    } catch (err) {
      console.warn('[ltiSuggestMatch] NRPS membership fetch failed:', err);
      return { suggestion: null, reason: 'nrps-failed' as const };
    }
    if (sectionEmails.size === 0) {
      // The platform isn't releasing email over NRPS (the dependency this match
      // rests on) — the UI degrades to a title-based manual pick.
      return { suggestion: null, reason: 'no-emails-released' as const };
    }

    // 2. ClassLink creds (org-global, same as the Google bridge).
    const tenantUrl = CLASSLINK_TENANT_URL.value();
    const clClientId = CLASSLINK_CLIENT_ID.value();
    const clClientSecret = CLASSLINK_CLIENT_SECRET.value();
    if (!tenantUrl || !clClientId || !clClientSecret) {
      return { suggestion: null, reason: 'classlink-not-configured' as const };
    }

    // 3. Overlap each OWNED candidate class's roster emails with the section's.
    let best: MatchSuggestion | null = null;
    let secondOverlap = 0;
    for (const classlinkClassId of ownedCandidates) {
      let rosterEmails: Set<string>;
      try {
        const students = await classroomAddonNet.fetchClassStudents(
          tenantUrl,
          clClientId,
          clClientSecret,
          classlinkClassId
        );
        // Dedup fence: OneRoster can list the same student twice (merged/cross-listed enrollments).
        rosterEmails = new Set(
          students
            .map((s) => (s.email ?? '').toLowerCase())
            .filter((e) => e.length > 0)
        );
      } catch (err) {
        console.warn(
          `[ltiSuggestMatch] OneRoster fetch failed for class ${classlinkClassId}:`,
          err
        );
        continue;
      }
      if (rosterEmails.size === 0) continue;
      let overlap = 0;
      for (const e of rosterEmails) if (sectionEmails.has(e)) overlap += 1;
      if (overlap === 0) continue;
      const ratio = overlap / Math.min(rosterEmails.size, sectionEmails.size);
      if (!best || overlap > best.overlap) {
        if (best) secondOverlap = best.overlap;
        best = { classlinkClassId, overlap, ratio };
      } else if (overlap > secondOverlap) {
        secondOverlap = overlap;
      }
    }

    if (!best) {
      return { suggestion: null, reason: 'no-overlap' as const };
    }
    // Ambiguous when a runner-up is within one student of the winner (co-taught
    // / cross-listed) — the UI should then confirm rather than silently link.
    const ambiguous = best.overlap - secondOverlap <= 1 && secondOverlap > 0;
    return {
      suggestion: best,
      ambiguous,
      sectionMemberCount: sectionEmails.size,
    };
  }
);
