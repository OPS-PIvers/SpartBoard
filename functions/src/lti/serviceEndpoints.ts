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
import * as admin from 'firebase-admin';

import {
  getLtiPlatformConfig,
  TOOL_LAUNCH_URL,
  AGS_SCOPE_SCORE,
} from './config';
import { ALLOWED_ORIGINS } from '../classlinkShared';
import { signToolJwt } from './toolKey';
import {
  buildQuizContentItem,
  buildDeepLinkResponseClaims,
  isSchoologyReturnUrl,
} from './deepLink';
import { getAgsAccessToken, postScore } from './ags';

const LTI_TOOL_PRIVATE_KEY = defineSecret('LTI_TOOL_PRIVATE_KEY');

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
    // Auth: a teacherRole token minted by an instructor launch (ltiExchange),
    // scoped to the resource link it launched from.
    const claimToken = (request.auth?.token ?? {}) as Record<string, unknown>;
    if (claimToken.teacherRole !== true) {
      throw new HttpsError(
        'permission-denied',
        'A SpartBoard teacher launch is required to push grades.'
      );
    }

    const data = (request.data ?? {}) as {
      resourceLinkId?: unknown;
      maxPoints?: unknown;
      grades?: unknown;
    };
    const resourceLinkId =
      typeof data.resourceLinkId === 'string' ? data.resourceLinkId : '';
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
    if (claimToken.ltiResourceLinkId !== resourceLinkId) {
      throw new HttpsError(
        'permission-denied',
        'Not authorized to push grades for this assignment.'
      );
    }

    const rawGrades = Array.isArray(data.grades) ? data.grades : [];
    if (rawGrades.length === 0) {
      throw new HttpsError(
        'invalid-argument',
        'grades must be a non-empty array.'
      );
    }

    const cfg = await getLtiPlatformConfig(admin.firestore());
    const accessToken = await getAgsAccessToken({
      clientId: cfg.clientId,
      tokenUrl: cfg.tokenUrl,
      privatePem: LTI_TOOL_PRIVATE_KEY.value(),
      scopes: [AGS_SCOPE_SCORE],
    });
    const db = admin.firestore();
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
