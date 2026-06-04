/**
 * Tests for the two teacher-side LTI service callables:
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
 * Both are `kind`-aware (quiz_sessions vs video_activity_sessions).
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
    tokenUrl: 'https://lms/token',
  }),
}));

const { postScoreMock } = vi.hoisted(() => ({ postScoreMock: vi.fn() }));
vi.mock('./ags', async (orig) => ({
  ...(await orig<typeof import('./ags')>()),
  getAgsAccessToken: vi.fn().mockResolvedValue('ags-access-token'),
  postScore: postScoreMock,
}));

// Imported AFTER the mocks so the module picks them up.
import {
  ltiResolveNamesForAssignmentV1,
  ltiPushGradesForAssignmentV1,
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

const TEACHER = { uid: 'teacher-1', token: { email: 't@orono.k12.mn.us' } };

beforeEach(() => {
  vi.clearAllMocks();
  postScoreMock.mockResolvedValue({ ok: true, status: 200 });
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
    expect(res.results[0]).toMatchObject({ ok: false });
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
