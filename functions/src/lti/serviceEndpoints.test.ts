/**
 * Tests for the teacher-side LTI service callables:
 *
 *   ltiResolveNamesForAssignmentV1 — NRPS name resolution. The security-critical
 *   invariant is the gate: names go ONLY to the teacher who owns the session.
 *   Also pins that members map onto the SAME pseudonym uid that keys the response
 *   docs (`ltiStudentUid`).
 *
 *   ltiPushGradesForAssignmentV1 — AGS grade push from the dashboard, gated on
 *   session OWNERSHIP (not a launch-minted token). Pins the gate + that the
 *   resource link is taken from the session's server-captured `ltiAttachment`
 *   (never the client) and each score is clamped to [0, maxPoints].
 *
 *   ltiSignDeepLinkResponseV1 — signs a tool-signed LtiDeepLinkingResponse.
 *   Gated on the caller being a signed-in teacher (Regression: this callable
 *   was `invoker: 'public'` with NO `request.auth` check at all, unlike its
 *   siblings above — any unauthenticated caller could mint a signed deep-link
 *   response for an arbitrary Schoology return URL).
 *
 * The session-gated two are `kind`-aware (quiz_sessions vs video_activity_sessions).
 */

/* eslint-disable @typescript-eslint/require-await -- mock async handlers mirror
   the async Admin-SDK / network surface without awaiting anything. */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ─────────────────────────────────────────────────────────
vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'HttpsError';
    }
  }
  return {
    onCall: (_options: unknown, handler: unknown) => handler,
    HttpsError,
  };
});

vi.mock('firebase-functions/params', () => ({
  defineSecret: () => ({ value: () => 'test-hmac-secret' }),
}));

// Configurable Firestore state.
let sessionDoc: { exists: boolean; data: () => unknown };
let contextDocs: Array<{ id: string; data: () => unknown }>;
let gradeLinks: Map<string, Record<string, unknown>>;
let lastSessionCollection = '';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(() => ({
    collection: (name: string) => {
      if (name === 'quiz_sessions' || name === 'video_activity_sessions') {
        return {
          doc: () => ({
            get: async () => {
              lastSessionCollection = name;
              return sessionDoc;
            },
          }),
        };
      }
      if (name === 'lti_session_memberships') {
        return {
          doc: () => ({
            collection: () => ({
              get: async () => ({
                empty: contextDocs.length === 0,
                size: contextDocs.length,
                docs: contextDocs,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
    doc: (path: string) => ({
      get: async () => ({
        exists: gradeLinks.has(path),
        data: () => gradeLinks.get(path),
      }),
    }),
  })),
}));

vi.mock('./config', async (orig) => ({
  ...(await orig<typeof import('./config')>()),
  getLtiPlatformConfig: vi.fn().mockResolvedValue({
    clientId: 'client-1',
    deploymentId: 'deployment-1',
    issuer: 'https://schoology.schoology.com',
    tokenUrl: 'https://lms/token',
  }),
}));

const { postScoreMock } = vi.hoisted(() => ({ postScoreMock: vi.fn() }));
vi.mock('./ags', async (orig) => ({
  ...(await orig<typeof import('./ags')>()),
  getAgsAccessToken: vi.fn().mockResolvedValue('ags-access-token'),
  postScore: postScoreMock,
}));

// Real RSA signing is irrelevant to the auth-gate + payload-shaping tests
// below — stub it so the fake secret value doesn't need to be a real PEM.
const { signToolJwtMock } = vi.hoisted(() => ({
  signToolJwtMock: vi.fn().mockResolvedValue('signed.jwt.value'),
}));
vi.mock('./toolKey', () => ({ signToolJwt: signToolJwtMock }));

// Imported AFTER the mocks so the module picks them up.
import {
  ltiResolveNamesForAssignmentV1,
  ltiPushGradesForAssignmentV1,
  ltiSignDeepLinkResponseV1,
} from './serviceEndpoints';
import { ltiStudentUid } from './identity';
import { nrpsNet } from './nrps';

interface ResolveResult {
  names: Record<string, { givenName: string; familyName: string }>;
}
const callResolve = ltiResolveNamesForAssignmentV1 as unknown as (req: {
  auth?: { uid: string; token: Record<string, unknown> };
  data: unknown;
}) => Promise<ResolveResult>;

interface PushResult {
  results: Array<{ pseudonymUid: string; ok: boolean; reason?: string }>;
  pushed: number;
  total: number;
}
const callPush = ltiPushGradesForAssignmentV1 as unknown as (req: {
  auth?: { uid: string; token: Record<string, unknown> };
  data: unknown;
}) => Promise<PushResult>;

interface SignResult {
  jwt: string;
  returnUrl: string;
}
const callSign = ltiSignDeepLinkResponseV1 as unknown as (req: {
  auth?: { uid: string; token: Record<string, unknown> };
  data: unknown;
}) => Promise<SignResult>;

const TEACHER = { uid: 'teacher-1', token: { email: 't@orono.k12.mn.us' } };

beforeEach(() => {
  vi.clearAllMocks();
  postScoreMock.mockResolvedValue({ ok: true, status: 200, isRedirect: false });
  sessionDoc = { exists: true, data: () => ({ teacherUid: 'teacher-1' }) };
  contextDocs = [];
  gradeLinks = new Map();
  lastSessionCollection = '';
});

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toMatchObject({ code });
}

describe('ltiResolveNamesForAssignmentV1 — security gate', () => {
  it('rejects an unauthenticated caller', async () => {
    await expectCode(
      callResolve({ data: { sessionId: 's1' } }),
      'unauthenticated'
    );
  });

  it('rejects a studentRole token', async () => {
    await expectCode(
      callResolve({
        auth: { uid: 'kid', token: { studentRole: true } },
        data: { sessionId: 's1' },
      }),
      'permission-denied'
    );
  });

  it('rejects a token with no email (defense-in-depth teacher gate)', async () => {
    await expectCode(
      callResolve({
        auth: { uid: 'teacher-1', token: {} },
        data: { sessionId: 's1' },
      }),
      'permission-denied'
    );
  });

  it('rejects when the session is owned by a different teacher', async () => {
    sessionDoc = { exists: true, data: () => ({ teacherUid: 'someone-else' }) };
    await expectCode(
      callResolve({ auth: TEACHER, data: { sessionId: 's1' } }),
      'permission-denied'
    );
  });

  it('rejects when the session does not exist', async () => {
    sessionDoc = { exists: false, data: () => undefined };
    await expectCode(
      callResolve({ auth: TEACHER, data: { sessionId: 's1' } }),
      'permission-denied'
    );
  });

  it('requires a sessionId', async () => {
    await expectCode(
      callResolve({ auth: TEACHER, data: {} }),
      'invalid-argument'
    );
  });
});

describe('ltiResolveNamesForAssignmentV1 — resolution', () => {
  it('returns an empty map for a session with no persisted contexts', async () => {
    contextDocs = [];
    const res = await callResolve({ auth: TEACHER, data: { sessionId: 's1' } });
    expect(res.names).toEqual({});
  });

  it('maps members onto the response-doc pseudonym uid', async () => {
    contextDocs = [
      {
        id: 'ctx-1',
        data: () => ({ contextMembershipsUrl: 'https://lms/m1' }),
      },
    ];
    vi.spyOn(nrpsNet, 'fetchMembershipPage').mockResolvedValue({
      ok: true,
      status: 200,
      members: [
        { user_id: 'sub-A', given_name: 'Ada', family_name: 'L' },
        { user_id: 'sub-B', given_name: 'Bob', family_name: 'H' },
      ],
      nextUrl: null,
      isRedirect: false,
    });

    const res = await callResolve({ auth: TEACHER, data: { sessionId: 's1' } });

    const uidA = ltiStudentUid('sub-A', 'test-hmac-secret');
    const uidB = ltiStudentUid('sub-B', 'test-hmac-secret');
    expect(res.names[uidA]).toEqual({ givenName: 'Ada', familyName: 'L' });
    expect(res.names[uidB]).toEqual({ givenName: 'Bob', familyName: 'H' });
  });

  it('throws `unavailable` when every context fetch fails (real NRPS outage, not empty)', async () => {
    contextDocs = [
      {
        id: 'ctx-1',
        data: () => ({ contextMembershipsUrl: 'https://lms/m1' }),
      },
    ];
    vi.spyOn(nrpsNet, 'fetchMembershipPage').mockResolvedValue({
      ok: false,
      status: 403,
      members: [],
      nextUrl: null,
      isRedirect: false,
    });
    await expectCode(
      callResolve({ auth: TEACHER, data: { sessionId: 's1' } }),
      'unavailable'
    );
  });

  // Regression (#2433 round-3 review): fetchNrpsMembers now throws on a
  // page-2+ refused redirect instead of silently breaking with a partial
  // roster. Before that fix, this scenario (page 1 succeeds, page 2 is a
  // refused redirect) would have returned contextsFetched=1 — treated as a
  // successful, if incomplete, resolution. Now it must propagate as a
  // context-level failure, and since it's the only context, the callable's
  // all-failed guard fires — exercising the behavioral change through the
  // actual callable, not just fetchNrpsMembers in isolation (see nrps.test.ts
  // for the unit-level coverage of the throw itself).
  it('throws `unavailable` when a context resolves page 1 but hits a refused redirect on page 2 (SSRF guard)', async () => {
    contextDocs = [
      {
        id: 'ctx-1',
        data: () => ({ contextMembershipsUrl: 'https://lms/m1' }),
      },
    ];
    vi.spyOn(nrpsNet, 'fetchMembershipPage')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        members: [{ user_id: 'sub-A', given_name: 'Ada', family_name: 'L' }],
        nextUrl: 'https://lms/m1?page=2',
        isRedirect: false,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 0,
        members: [],
        nextUrl: null,
        isRedirect: true,
      });

    await expectCode(
      callResolve({ auth: TEACHER, data: { sessionId: 's1' } }),
      'unavailable'
    );
  });

  it('resolves a video-activity session against its own collection', async () => {
    contextDocs = [];
    await callResolve({
      auth: TEACHER,
      data: { sessionId: 's1', kind: 'va' },
    });
    expect(lastSessionCollection).toBe('video_activity_sessions');
  });
});

describe('ltiPushGradesForAssignmentV1 — security gate', () => {
  const goodData = {
    sessionId: 's1',
    maxPoints: 20,
    grades: [{ pseudonymUid: 'uid-A', pointsEarned: 18 }],
  };

  it('rejects an unauthenticated caller', async () => {
    await expectCode(callPush({ data: goodData }), 'unauthenticated');
  });

  it('rejects a studentRole token', async () => {
    await expectCode(
      callPush({
        auth: { uid: 'kid', token: { studentRole: true } },
        data: goodData,
      }),
      'permission-denied'
    );
  });

  it('rejects a token with no email', async () => {
    await expectCode(
      callPush({ auth: { uid: 'teacher-1', token: {} }, data: goodData }),
      'permission-denied'
    );
  });

  it('rejects when the session is owned by a different teacher', async () => {
    sessionDoc = {
      exists: true,
      data: () => ({
        teacherUid: 'someone-else',
        ltiAttachment: { resourceLinkId: 'rl-1' },
      }),
    };
    await expectCode(
      callPush({ auth: TEACHER, data: goodData }),
      'permission-denied'
    );
  });

  it('requires sessionId + positive maxPoints', async () => {
    await expectCode(
      callPush({ auth: TEACHER, data: { grades: goodData.grades } }),
      'invalid-argument'
    );
  });

  it('fails precondition when the session has no Schoology attachment', async () => {
    sessionDoc = { exists: true, data: () => ({ teacherUid: 'teacher-1' }) };
    await expectCode(
      callPush({ auth: TEACHER, data: goodData }),
      'failed-precondition'
    );
  });
});

describe('ltiPushGradesForAssignmentV1 — push', () => {
  beforeEach(() => {
    sessionDoc = {
      exists: true,
      data: () => ({
        teacherUid: 'teacher-1',
        ltiAttachment: { resourceLinkId: 'rl-1', contextId: 'ctx-1' },
      }),
    };
  });

  it('resolves each student line item from the session resource link and clamps the score', async () => {
    gradeLinks.set('lti_grade_links/uid-A/resources/rl-1', {
      sub: 'sub-A',
      ags: { lineitem: 'https://lms/lineitems/1' },
    });

    const res = await callPush({
      auth: TEACHER,
      data: {
        sessionId: 's1',
        maxPoints: 20,
        // Over-cap on purpose → must clamp to 20.
        grades: [{ pseudonymUid: 'uid-A', pointsEarned: 999 }],
      },
    });

    expect(res.pushed).toBe(1);
    expect(res.total).toBe(1);
    expect(postScoreMock).toHaveBeenCalledTimes(1);
    const arg = postScoreMock.mock.calls[0][0] as {
      lineitemUrl: string;
      score: { userId: string; scoreGiven: number; scoreMaximum: number };
    };
    expect(arg.lineitemUrl).toBe('https://lms/lineitems/1');
    expect(arg.score).toMatchObject({
      userId: 'sub-A',
      scoreGiven: 20,
      scoreMaximum: 20,
    });
  });

  // Regression (#2433 round-4 review): the conditional spread
  // `...(r.isRedirect ? { isRedirect: true } : {})` omitted the key
  // entirely whenever postScore's isRedirect was false, leaving
  // `result.isRedirect` `undefined` for ordinary successes and failures
  // alike — not explicit `false`. A future retry guard written as
  // `result.isRedirect === false` (the natural way to confirm
  // retry-safety) would silently never fire against `undefined`.
  it('sets isRedirect:false explicitly on the GradeResult for an ordinary successful push', async () => {
    gradeLinks.set('lti_grade_links/uid-A/resources/rl-1', {
      sub: 'sub-A',
      ags: { lineitem: 'https://lms/lineitems/1' },
    });

    const res = await callPush({
      auth: TEACHER,
      data: {
        sessionId: 's1',
        maxPoints: 20,
        grades: [{ pseudonymUid: 'uid-A', pointsEarned: 10 }],
      },
    });

    expect(res.results[0]).toHaveProperty('isRedirect', false);
  });

  // Regression (#2433 round-3 review): postScore's isRedirect signal was
  // computed but never threaded through GradeResult — a future retry keyed
  // on status:0 would have retried a redirect attack, resending the bearer
  // token toward the redirect target on every attempt.
  it('propagates isRedirect:true onto the GradeResult when postScore refuses a redirect (SSRF guard)', async () => {
    gradeLinks.set('lti_grade_links/uid-A/resources/rl-1', {
      sub: 'sub-A',
      ags: { lineitem: 'https://lms/lineitems/1' },
    });
    postScoreMock.mockResolvedValue({ ok: false, status: 0, isRedirect: true });

    const res = await callPush({
      auth: TEACHER,
      data: {
        sessionId: 's1',
        maxPoints: 20,
        grades: [{ pseudonymUid: 'uid-A', pointsEarned: 10 }],
      },
    });

    expect(res.results[0]).toMatchObject({ ok: false, isRedirect: true });
  });

  it('skips a student who never launched (no grade link)', async () => {
    const res = await callPush({
      auth: TEACHER,
      data: {
        sessionId: 's1',
        maxPoints: 20,
        grades: [{ pseudonymUid: 'never', pointsEarned: 10 }],
      },
    });
    expect(res.pushed).toBe(0);
    // Regression (#2433 round-5 review): this early-exit return omitted
    // isRedirect, leaving it undefined instead of explicit false — same
    // footgun as the postScore-path return above, for a caller that keys a
    // future retry guard on `result.isRedirect === false`.
    expect(res.results[0]).toMatchObject({
      ok: false,
      reason: 'student never launched',
      isRedirect: false,
    });
    expect(postScoreMock).not.toHaveBeenCalled();
  });

  it('sets isRedirect:false on an invalid grade entry (missing/non-numeric pointsEarned)', async () => {
    const res = await callPush({
      auth: TEACHER,
      data: {
        sessionId: 's1',
        maxPoints: 20,
        grades: [{ pseudonymUid: 'uid-A', pointsEarned: 'not-a-number' }],
      },
    });
    expect(res.results[0]).toMatchObject({
      ok: false,
      reason: 'invalid entry',
      isRedirect: false,
    });
    expect(postScoreMock).not.toHaveBeenCalled();
  });

  it('sets isRedirect:false when the student has no line item on record', async () => {
    gradeLinks.set('lti_grade_links/uid-A/resources/rl-1', {
      sub: 'sub-A',
      // No `ags.lineitem` — student launched but the deep-link never
      // attached a gradable line item.
    });

    const res = await callPush({
      auth: TEACHER,
      data: {
        sessionId: 's1',
        maxPoints: 20,
        grades: [{ pseudonymUid: 'uid-A', pointsEarned: 10 }],
      },
    });
    expect(res.results[0]).toMatchObject({
      ok: false,
      reason: 'no line item for student',
      isRedirect: false,
    });
    expect(postScoreMock).not.toHaveBeenCalled();
  });

  it('rejects an empty grades array', async () => {
    await expectCode(
      callPush({
        auth: TEACHER,
        data: { sessionId: 's1', maxPoints: 20, grades: [] },
      }),
      'invalid-argument'
    );
  });
});

describe('ltiSignDeepLinkResponseV1 — security gate', () => {
  const goodData = {
    returnUrl: 'https://schoology.schoology.com/lti/deep_link_return',
    kind: 'quiz',
    quizCode: 'ABC123',
    title: 'Fractions Quiz',
  };

  // Regression: this callable had NO `request.auth` check at all — any
  // unauthenticated caller could reach signToolJwt and mint a tool-signed
  // deep-link response for an arbitrary Schoology return URL. Before the fix
  // this call resolved successfully instead of rejecting.
  it('rejects an unauthenticated caller', async () => {
    await expectCode(callSign({ data: goodData }), 'unauthenticated');
    expect(signToolJwtMock).not.toHaveBeenCalled();
  });

  it('rejects a studentRole token', async () => {
    await expectCode(
      callSign({
        auth: { uid: 'kid', token: { studentRole: true } },
        data: goodData,
      }),
      'permission-denied'
    );
    expect(signToolJwtMock).not.toHaveBeenCalled();
  });

  it('rejects a token with no email (defense-in-depth teacher gate)', async () => {
    await expectCode(
      callSign({ auth: { uid: 'teacher-1', token: {} }, data: goodData }),
      'permission-denied'
    );
    expect(signToolJwtMock).not.toHaveBeenCalled();
  });

  it('signs and returns a JWT for a properly authenticated teacher', async () => {
    const res = await callSign({ auth: TEACHER, data: goodData });
    expect(res).toEqual({
      jwt: 'signed.jwt.value',
      returnUrl: goodData.returnUrl,
    });
    expect(signToolJwtMock).toHaveBeenCalledTimes(1);
  });

  it('still rejects a non-Schoology return URL for an authenticated teacher', async () => {
    await expectCode(
      callSign({
        auth: TEACHER,
        data: { ...goodData, returnUrl: 'https://evil.example.com/return' },
      }),
      'invalid-argument'
    );
    expect(signToolJwtMock).not.toHaveBeenCalled();
  });
});
