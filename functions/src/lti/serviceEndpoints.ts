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
  LTI_SESSION_MEMBERSHIPS_COLLECTION,
} from './nrpsStore';
import { validateGradePushAuth } from './stores';

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
    cors: ALLOWED_ORIGINS,
    secrets: [LTI_TOOL_PRIVATE_KEY],
  },
  async (request) => {
    const data = (request.data ?? {}) as {
      resourceLinkId?: unknown;
      maxPoints?: unknown;
      grades?: unknown;
      pushAuth?: unknown;
    };
    const resourceLinkId =
      typeof data.resourceLinkId === 'string' ? data.resourceLinkId : '';
    const pushAuth = typeof data.pushAuth === 'string' ? data.pushAuth : '';
    const maxPoints =
      typeof data.maxPoints === 'number' && data.maxPoints > 0
        ? data.maxPoints
        : 0;
    if (!resourceLinkId || !maxPoints) {
      throw new HttpsError(
        'invalid-argument',
        'resourceLinkId and a positive maxPoints are required.'
      );
    }

    const db = admin.firestore();
    // Authorize via the short-lived grade-push token minted by the instructor
    // launch (the LIVE-token model) — lets a Google-signed-in teacher push.
    if (!(await validateGradePushAuth(db, pushAuth, resourceLinkId))) {
      throw new HttpsError(
        'permission-denied',
        'Invalid or expired grade-push authorization. Re-open the assignment from Schoology.'
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
    // Teachers only. Students carry `studentRole` and never own a session, but
    // short-circuit them explicitly (mirrors getPseudonymsForAssignmentV1).
    if (request.auth.token.studentRole === true) {
      throw new HttpsError('permission-denied', 'Teacher account required.');
    }
    const data = (request.data ?? {}) as { sessionId?: unknown };
    const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
    if (!sessionId) {
      throw new HttpsError('invalid-argument', 'sessionId is required.');
    }

    const db = admin.firestore();

    // SECURITY GATE: the caller must own the session. Same opaque error for
    // "no session" and "not your session" so we don't reveal session existence.
    const sessSnap = await db
      .collection(QUIZ_SESSIONS_COLLECTION)
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
    for (const doc of ctxSnap.docs) {
      const url =
        typeof doc.data().contextMembershipsUrl === 'string'
          ? (doc.data().contextMembershipsUrl as string)
          : '';
      if (!url) continue;
      try {
        const members = await fetchNrpsMembers(url, accessToken);
        for (const m of members) {
          const uid = ltiStudentUid(m.userId, hmacSecret);
          names[uid] = {
            givenName: m.givenName,
            familyName: m.familyName,
          };
          if (m.givenName || m.familyName) withName += 1;
        }
      } catch (err) {
        console.warn(`[ltiResolveNames] context ${doc.id} fetch failed:`, err);
      }
    }

    // PII-free diagnostics: counts only, never names. `withName` confirms the
    // platform is releasing names in the membership payload (the one unknown).
    console.log(
      `[ltiResolveNames] session=${sessionId} contexts=${ctxSnap.size} ` +
        `members=${Object.keys(names).length} withName=${withName}`
    );
    return { names };
  }
);
