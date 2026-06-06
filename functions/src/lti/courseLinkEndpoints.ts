// Schoology LTI 1.3 — class↔course linking (Item D part 2, Schoology side).
//
//   linkLtiCourseV1            — pair a Schoology section (contextId) to a
//                                ClassLink class, mirroring linkClassroomCourse.
//   unlinkLtiCourseV1          — remove that pairing.
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
import * as admin from 'firebase-admin';

import { getLtiPlatformConfig, NRPS_SCOPE } from './config';
import { ALLOWED_ORIGINS } from '../classlinkShared';
import { getAgsAccessToken } from './ags';
import { fetchNrpsMembers } from './nrps';
import {
  QUIZ_SESSIONS_COLLECTION,
  VIDEO_ACTIVITY_SESSIONS_COLLECTION,
  LTI_SESSION_MEMBERSHIPS_COLLECTION,
  type LtiSessionKind,
} from './nrpsStore';
// Reuse the existing OneRoster seam (and its test-spy point) rather than
// re-implementing the signed fetch. fetchClassStudents takes the creds as args.
import { classroomAddonNet } from '../classroomAddonAuth';

/** Firestore collection holding the Schoology section↔class link docs. */
export const LTI_COURSE_LINKS_COLLECTION = 'lti_course_links';

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
  return {
    contextTitle: typeof cd.contextTitle === 'string' ? cd.contextTitle : null,
    membershipUrl:
      typeof cd.contextMembershipsUrl === 'string'
        ? cd.contextMembershipsUrl
        : null,
  };
}

/** Require an authed, email-bearing, non-student caller; return their uid. */
function requireTeacher(request: {
  auth?: { uid: string; token: { email?: string; studentRole?: unknown } };
}): string {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  if (!request.auth.token.email || request.auth.token.studentRole === true) {
    throw new HttpsError('permission-denied', 'Teacher account required.');
  }
  return request.auth.uid;
}

const ID_RE = /^[A-Za-z0-9:_.-]{1,256}$/;

// ── linkLtiCourseV1 ─────────────────────────────────────────────────────────
export const linkLtiCourseV1 = onCall(
  { region: 'us-central1', invoker: 'public', cors: ALLOWED_ORIGINS },
  async (request) => {
    const callerUid = requireTeacher(request);
    const data = (request.data ?? {}) as {
      contextId?: unknown;
      sessionId?: unknown;
      kind?: unknown;
      classlinkClassId?: unknown;
      classlinkOrgId?: unknown;
      rosterId?: unknown;
    };
    const contextId = typeof data.contextId === 'string' ? data.contextId : '';
    const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
    const kind: LtiSessionKind = data.kind === 'va' ? 'va' : 'quiz';
    const classlinkClassId =
      typeof data.classlinkClassId === 'string' ? data.classlinkClassId : '';
    if (!ID_RE.test(contextId) || !sessionId || !classlinkClassId) {
      throw new HttpsError(
        'invalid-argument',
        'contextId, sessionId, and classlinkClassId are required.'
      );
    }
    const classlinkOrgId =
      typeof data.classlinkOrgId === 'string' ? data.classlinkOrgId : null;
    const rosterId = typeof data.rosterId === 'string' ? data.rosterId : null;

    const db = admin.firestore();
    const { contextTitle } = await assertOwnsSchoologyContext(
      db,
      callerUid,
      sessionId,
      kind,
      contextId
    );

    // Transactional check-then-write: never re-point a link another teacher owns
    // (no-hijack); a same-teacher re-link just updates the paired class.
    await db.runTransaction(async (tx) => {
      const ref = db.collection(LTI_COURSE_LINKS_COLLECTION).doc(contextId);
      const existing = await tx.get(ref);
      if (existing.exists) {
        const prior = existing.data() as { teacherUid?: unknown };
        const priorTeacher =
          typeof prior?.teacherUid === 'string' ? prior.teacherUid : '';
        if (priorTeacher && priorTeacher !== callerUid) {
          throw new HttpsError(
            'already-exists',
            'This Schoology section is already linked by another teacher.'
          );
        }
      }
      const payload: Record<string, unknown> = {
        teacherUid: callerUid,
        contextId,
        classlinkClassId,
        classlinkOrgId,
        contextTitle,
        rosterId,
        updatedAt: Date.now(),
      };
      if (!existing.exists) payload.createdAt = Date.now();
      tx.set(ref, payload, { merge: true });
    });

    return { ok: true, contextId };
  }
);

// ── unlinkLtiCourseV1 ───────────────────────────────────────────────────────
export const unlinkLtiCourseV1 = onCall(
  { region: 'us-central1', invoker: 'public', cors: ALLOWED_ORIGINS },
  async (request) => {
    const callerUid = requireTeacher(request);
    const data = (request.data ?? {}) as {
      contextId?: unknown;
      sessionId?: unknown;
      kind?: unknown;
    };
    const contextId = typeof data.contextId === 'string' ? data.contextId : '';
    const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
    const kind: LtiSessionKind = data.kind === 'va' ? 'va' : 'quiz';
    if (!ID_RE.test(contextId) || !sessionId) {
      throw new HttpsError(
        'invalid-argument',
        'contextId and sessionId are required.'
      );
    }

    const db = admin.firestore();
    // Trust anchor: the caller must own a session that saw this context.
    await assertOwnsSchoologyContext(db, callerUid, sessionId, kind, contextId);

    const removed = await db.runTransaction(async (tx) => {
      const ref = db.collection(LTI_COURSE_LINKS_COLLECTION).doc(contextId);
      const existing = await tx.get(ref);
      if (!existing.exists) return false;
      const prior = existing.data() as { teacherUid?: unknown };
      const priorUid =
        typeof prior?.teacherUid === 'string' ? prior.teacherUid : '';
      if (priorUid && priorUid !== callerUid) {
        // A verified co-teacher (owns a session that saw the context) may clear
        // the link; log it for audit, mirroring unlinkClassroomCourse.
        console.warn(
          `[unlinkLtiCourse] context ${contextId} link owned by ${priorUid} ` +
            `removed by verified co-teacher ${callerUid}.`
        );
      }
      tx.delete(ref);
      return true;
    });

    return { ok: true, removed };
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
    const callerUid = requireTeacher(request);
    const data = (request.data ?? {}) as {
      contextId?: unknown;
      sessionId?: unknown;
      kind?: unknown;
      candidates?: unknown;
    };
    const contextId = typeof data.contextId === 'string' ? data.contextId : '';
    const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
    const kind: LtiSessionKind = data.kind === 'va' ? 'va' : 'quiz';
    if (!ID_RE.test(contextId) || !sessionId) {
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
      console.error('[ltiSuggestMatch] NRPS token mint failed:', err);
      throw new HttpsError(
        'internal',
        'Could not authorize the roster service.'
      );
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

    // 3. Overlap each candidate class's roster emails with the section's.
    let best: MatchSuggestion | null = null;
    let secondOverlap = 0;
    for (const classlinkClassId of candidates) {
      let rosterEmails: string[];
      try {
        const students = await classroomAddonNet.fetchClassStudents(
          tenantUrl,
          clClientId,
          clClientSecret,
          classlinkClassId
        );
        rosterEmails = students
          .map((s) => (s.email ?? '').toLowerCase())
          .filter((e) => e.length > 0);
      } catch (err) {
        console.warn(
          `[ltiSuggestMatch] OneRoster fetch failed for class ${classlinkClassId}:`,
          err
        );
        continue;
      }
      if (rosterEmails.length === 0) continue;
      let overlap = 0;
      for (const e of rosterEmails) if (sectionEmails.has(e)) overlap += 1;
      if (overlap === 0) continue;
      const ratio = overlap / Math.min(rosterEmails.length, sectionEmails.size);
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
