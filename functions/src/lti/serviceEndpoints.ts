// Schoology LTI 1.3 — Advantage service callables (Deep Linking + AGS).
//
//   ltiSignDeepLinkResponseV1     — sign the LtiDeepLinkingResponse the picker POSTs
//                                   back to Schoology to attach a quiz.
//   ltiPushGradesForAssignmentV1  — push AGS scores for an assignment, gated to the
//                                   teacher who launched it.
//
// Both sign/authenticate with the tool private key (Secret Manager).

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { randomBytes } from 'node:crypto';
import * as admin from 'firebase-admin';

import {
  getLtiPlatformConfig,
  TOOL_LAUNCH_URL,
  AGS_SCOPE_SCORE,
  NRPS_SCOPE,
} from './config';
import { ALLOWED_ORIGINS } from '../classlinkShared';
import { signToolJwt } from './toolKey';
import {
  buildQuizContentItem,
  buildDeepLinkResponseClaims,
  isSchoologyReturnUrl,
} from './deepLink';
import { getAgsAccessToken, postScore } from './ags';
import { fetchNrpsMembers } from './nrps';
import { ltiStudentUid } from './identity';
import {
  QUIZ_SESSIONS_COLLECTION,
  VIDEO_ACTIVITY_SESSIONS_COLLECTION,
  LTI_SESSION_MEMBERSHIPS_COLLECTION,
  type LtiSessionKind,
} from './nrpsStore';

/** The Firestore session collection a launch `kind` targets. */
function sessionCollectionForKind(kind: LtiSessionKind): string {
  return kind === 'va'
    ? VIDEO_ACTIVITY_SESSIONS_COLLECTION
    : QUIZ_SESSIONS_COLLECTION;
}

const LTI_TOOL_PRIVATE_KEY = defineSecret('LTI_TOOL_PRIVATE_KEY');
const STUDENT_PSEUDONYM_HMAC_SECRET = defineSecret(
  'STUDENT_PSEUDONYM_HMAC_SECRET'
);

// ── ltiSignDeepLinkResponseV1 ───────────────────────────────────────────────
export const ltiSignDeepLinkResponseV1 = onCall(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
    secrets: [LTI_TOOL_PRIVATE_KEY],
  },
  async (request) => {
    const data = (request.data ?? {}) as {
      returnUrl?: unknown;
      dlData?: unknown;
      kind?: unknown;
      quizCode?: unknown;
      sessionId?: unknown;
      title?: unknown;
      maxPoints?: unknown;
    };

    const returnUrl = typeof data.returnUrl === 'string' ? data.returnUrl : '';
    if (!isSchoologyReturnUrl(returnUrl)) {
      throw new HttpsError('invalid-argument', 'Invalid deep-link return URL.');
    }

    const title =
      typeof data.title === 'string' && data.title.trim()
        ? data.title.trim().slice(0, 200)
        : 'SpartBoard';
    const kind = data.kind === 'va' ? 'va' : 'quiz';
    const maxPoints =
      typeof data.maxPoints === 'number' && data.maxPoints > 0
        ? data.maxPoints
        : undefined;

    const custom: Record<string, string> = { kind };
    if (kind === 'quiz') {
      const code = typeof data.quizCode === 'string' ? data.quizCode : '';
      if (!/^[A-Za-z0-9]{1,16}$/.test(code)) {
        throw new HttpsError('invalid-argument', 'Invalid quiz code.');
      }
      custom.quiz_code = code;
    } else {
      const sid = typeof data.sessionId === 'string' ? data.sessionId : '';
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(sid)) {
        throw new HttpsError('invalid-argument', 'Invalid session id.');
      }
      custom.session_id = sid;
    }

    const cfg = await getLtiPlatformConfig(admin.firestore());
    const item = buildQuizContentItem({
      launchUrl: TOOL_LAUNCH_URL,
      title,
      custom,
      maxPoints,
    });
    const claims = buildDeepLinkResponseClaims({
      deploymentId: cfg.deploymentId,
      nonce: randomBytes(16).toString('hex'),
      data: typeof data.dlData === 'string' ? data.dlData : undefined,
      contentItems: [item],
    });

    const jwt = await signToolJwt(LTI_TOOL_PRIVATE_KEY.value(), {
      issuer: cfg.clientId,
      subject: cfg.clientId,
      audience: cfg.issuer,
      claims,
    });
    return { jwt, returnUrl };
  }
);

// ── ltiPushGradesForAssignmentV1 ────────────────────────────────────────────
interface GradeResult {
  pseudonymUid: string;
  ok: boolean;
  status?: number;
  reason?: string;
}

export const ltiPushGradesForAssignmentV1 = onCall(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
    secrets: [LTI_TOOL_PRIVATE_KEY],
  },
  async (request) => {
    // SECURITY: gated on session OWNERSHIP — the teacher pushes from the
    // dashboard Results view, signed in with their own SpartBoard account (same
    // model as the NRPS name resolver). Mirrors getPseudonymsForAssignmentV1:
    // require an email-bearing token, reject studentRole, then verify the caller
    // teaches the session below. No launch-minted credential needed.
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    if (!request.auth.token.email || request.auth.token.studentRole === true) {
      throw new HttpsError('permission-denied', 'Teacher account required.');
    }

    const data = (request.data ?? {}) as {
      sessionId?: unknown;
      kind?: unknown;
      maxPoints?: unknown;
      grades?: unknown;
    };
    const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
    const kind: LtiSessionKind = data.kind === 'va' ? 'va' : 'quiz';
    const maxPoints =
      typeof data.maxPoints === 'number' && data.maxPoints > 0
        ? data.maxPoints
        : 0;
    if (!sessionId || !maxPoints) {
      throw new HttpsError(
        'invalid-argument',
        'sessionId and a positive maxPoints are required.'
      );
    }

    const db = admin.firestore();

    // SECURITY GATE: the caller must own the session. Same opaque error for
    // "no session" and "not your session" so we don't reveal session existence.
    const sessSnap = await db
      .collection(sessionCollectionForKind(kind))
      .doc(sessionId)
      .get();
    const sess = sessSnap.data();
    const sessTeacherUid =
      typeof sess?.teacherUid === 'string' ? sess.teacherUid : '';
    if (!sessSnap.exists || sessTeacherUid !== request.auth.uid) {
      throw new HttpsError(
        'permission-denied',
        'Not the teacher of this session.'
      );
    }

    // The resource-link id is derived from the session's server-captured LTI
    // attachment — never trusted from the client — so a teacher can only ever
    // push to the line item their own Schoology launch created.
    const resourceLinkId =
      sess?.ltiAttachment && typeof sess.ltiAttachment === 'object'
        ? ((sess.ltiAttachment as { resourceLinkId?: unknown })
            .resourceLinkId ?? '')
        : '';
    if (typeof resourceLinkId !== 'string' || !resourceLinkId) {
      throw new HttpsError(
        'failed-precondition',
        'This assignment is not linked to Schoology for grade push.'
      );
    }

    const rawGrades = Array.isArray(data.grades) ? data.grades : [];
    if (rawGrades.length === 0) {
      throw new HttpsError(
        'invalid-argument',
        'grades must be a non-empty array.'
      );
    }

    const cfg = await getLtiPlatformConfig(db);
    const accessToken = await getAgsAccessToken({
      clientId: cfg.clientId,
      tokenUrl: cfg.tokenUrl,
      privatePem: LTI_TOOL_PRIVATE_KEY.value(),
      scopes: [AGS_SCOPE_SCORE],
    });
    const timestamp = new Date().toISOString();

    // Resolve each student's OWN line item (per-section for linked/merged courses)
    // from the grade-sync key written at their launch, then POST the score.
    const results: GradeResult[] = await Promise.all(
      rawGrades.map(async (g): Promise<GradeResult> => {
        const entry = (g ?? {}) as {
          pseudonymUid?: unknown;
          pointsEarned?: unknown;
        };
        const pseudonymUid =
          typeof entry.pseudonymUid === 'string' ? entry.pseudonymUid : '';
        const pointsEarned =
          typeof entry.pointsEarned === 'number' ? entry.pointsEarned : NaN;
        if (!pseudonymUid || !Number.isFinite(pointsEarned)) {
          return { pseudonymUid, ok: false, reason: 'invalid entry' };
        }

        const snap = await db
          .doc(`lti_grade_links/${pseudonymUid}/resources/${resourceLinkId}`)
          .get();
        if (!snap.exists) {
          return { pseudonymUid, ok: false, reason: 'student never launched' };
        }
        const link = snap.data() as {
          sub?: string;
          ags?: { lineitem?: string };
        };
        const lineitem = link.ags?.lineitem;
        if (!lineitem || !link.sub) {
          return {
            pseudonymUid,
            ok: false,
            reason: 'no line item for student',
          };
        }

        const scoreGiven = Math.max(0, Math.min(maxPoints, pointsEarned));
        const r = await postScore({
          lineitemUrl: lineitem,
          accessToken,
          score: { userId: link.sub, scoreGiven, scoreMaximum: maxPoints },
          timestamp,
        });
        return { pseudonymUid, ok: r.ok, status: r.status };
      })
    );

    const pushed = results.filter((r) => r.ok).length;
    return { results, pushed, total: rawGrades.length };
  }
);

// ── ltiResolveNamesForAssignmentV1 ──────────────────────────────────────────
//
// Teacher-side name resolution for Schoology students — the NRPS analogue of
// `getPseudonymsForAssignmentV1` (the ClassLink resolver). Given a quiz session
// the caller TEACHES, fetch the persisted NRPS membership URL(s) for that
// session, mint an NRPS-scoped service token, GET the membership roster(s), and
// map each member's LTI `sub` → the SAME pseudonym uid that keys the response
// docs → their name. Names are returned to the teacher's browser and NEVER
// persisted (mirrors ClassLink: nothing about a name comes to rest in
// Firestore). Gated on session ownership, so a teacher only ever resolves their
// own session's contexts.
export const ltiResolveNamesForAssignmentV1 = onCall(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
    secrets: [LTI_TOOL_PRIVATE_KEY, STUDENT_PSEUDONYM_HMAC_SECRET],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    // Teachers only. Teachers authenticate with standard Firebase Auth (email
    // present on the token); students never have email and carry `studentRole`.
    // Require email + reject studentRole (mirrors getPseudonymsForAssignmentV1)
    // — defense in depth on top of the session-ownership gate below.
    if (!request.auth.token.email || request.auth.token.studentRole === true) {
      throw new HttpsError('permission-denied', 'Teacher account required.');
    }
    const data = (request.data ?? {}) as {
      sessionId?: unknown;
      kind?: unknown;
    };
    const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
    const kind: LtiSessionKind = data.kind === 'va' ? 'va' : 'quiz';
    if (!sessionId) {
      throw new HttpsError('invalid-argument', 'sessionId is required.');
    }

    const db = admin.firestore();

    // SECURITY GATE: the caller must own the session. Same opaque error for
    // "no session" and "not your session" so we don't reveal session existence.
    const sessSnap = await db
      .collection(sessionCollectionForKind(kind))
      .doc(sessionId)
      .get();
    const sessTeacherUid =
      typeof sessSnap.data()?.teacherUid === 'string'
        ? (sessSnap.data()?.teacherUid as string)
        : '';
    if (!sessSnap.exists || sessTeacherUid !== request.auth.uid) {
      throw new HttpsError(
        'permission-denied',
        'Not the teacher of this session.'
      );
    }

    const ctxSnap = await db
      .collection(LTI_SESSION_MEMBERSHIPS_COLLECTION)
      .doc(sessionId)
      .collection('contexts')
      .get();
    if (ctxSnap.empty) {
      // Non-LTI session (or no student has launched yet) — nothing to resolve.
      return { names: {} };
    }

    const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
    if (!hmacSecret) {
      throw new HttpsError('internal', 'Server not configured.');
    }

    const cfg = await getLtiPlatformConfig(db);
    let accessToken: string;
    try {
      accessToken = await getAgsAccessToken({
        clientId: cfg.clientId,
        tokenUrl: cfg.tokenUrl,
        privatePem: LTI_TOOL_PRIVATE_KEY.value(),
        scopes: [NRPS_SCOPE],
      });
    } catch (err) {
      console.error('[ltiResolveNames] NRPS token mint failed:', err);
      throw new HttpsError(
        'internal',
        'Could not authorize the roster service.'
      );
    }

    // Union every context filed under this session (a multi-section attach has
    // more than one). A per-context fetch failure is logged and skipped — a
    // partial map is strictly better than none.
    const names: Record<string, { givenName: string; familyName: string }> = {};
    let withName = 0;
    let contextsFetched = 0;
    let contextsFailed = 0;
    for (const doc of ctxSnap.docs) {
      const url =
        typeof doc.data().contextMembershipsUrl === 'string'
          ? (doc.data().contextMembershipsUrl as string)
          : '';
      if (!url) continue;
      try {
        const members = await fetchNrpsMembers(url, accessToken);
        contextsFetched += 1;
        for (const m of members) {
          const uid = ltiStudentUid(m.userId, hmacSecret);
          names[uid] = {
            givenName: m.givenName,
            familyName: m.familyName,
          };
          if (m.givenName || m.familyName) withName += 1;
        }
      } catch (err) {
        contextsFailed += 1;
        console.warn(`[ltiResolveNames] context ${doc.id} fetch failed:`, err);
      }
    }

    // If EVERY context with a URL failed, this is a real NRPS outage (scope
    // denied on the membership endpoint, expired/invalid URL, platform down) —
    // NOT the benign "no LTI students" case (which already returned {} above
    // when there were no contexts). Throw so the client's catch fires
    // (observability + cache eviction → retry on the next monitor open) instead
    // of silently rendering every student as "Student", which is byte-identical
    // to an empty resolve.
    if (contextsFetched === 0 && contextsFailed > 0) {
      throw new HttpsError(
        'unavailable',
        'Could not reach the Schoology roster service.'
      );
    }

    const total = Object.keys(names).length;
    // Members present but ZERO names = the platform connected yet is WITHHOLDING
    // names (the NRPS name-release / privacy config — the one unknown this whole
    // feature depends on). Warn (not info) so it's greppable/alertable: the fix
    // is in the Schoology app config, not the code.
    if (total > 0 && withName === 0) {
      console.warn(
        `[ltiResolveNames] session=${sessionId} platform returned ${total} ` +
          `members but ZERO names — check the Schoology NRPS name-release config`
      );
    }

    // PII-free diagnostics: counts only, never names.
    console.log(
      `[ltiResolveNames] session=${sessionId} contexts=${ctxSnap.size} ` +
        `fetched=${contextsFetched} failed=${contextsFailed} ` +
        `members=${total} withName=${withName}`
    );
    return { names };
  }
);
