/**
 * Tests for ltiResolveNamesForAssignmentV1 — the teacher-side NRPS name
 * resolver. The security-critical invariant is the gate: names are returned
 * ONLY to the teacher who owns the session, never to a student, an
 * unauthenticated caller, or a teacher querying someone else's session. Also
 * pins the happy path: members map onto the SAME pseudonym uid that keys the
 * response docs (`ltiStudentUid`).
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

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(() => ({
    collection: (name: string) => {
      if (name === 'quiz_sessions') {
        return { doc: () => ({ get: async () => sessionDoc }) };
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
  })),
}));

vi.mock('./config', async (orig) => ({
  ...(await orig<typeof import('./config')>()),
  getLtiPlatformConfig: vi.fn().mockResolvedValue({
    clientId: 'client-1',
    tokenUrl: 'https://lms/token',
  }),
}));

vi.mock('./ags', async (orig) => ({
  ...(await orig<typeof import('./ags')>()),
  getAgsAccessToken: vi.fn().mockResolvedValue('nrps-access-token'),
}));

// Imported AFTER the mocks so the module picks them up.
import { ltiResolveNamesForAssignmentV1 } from './serviceEndpoints';
import { ltiStudentUid } from './identity';
import { nrpsNet } from './nrps';

interface ResolveResult {
  names: Record<string, { givenName: string; familyName: string }>;
}
const callResolve = ltiResolveNamesForAssignmentV1 as unknown as (req: {
  auth?: { uid: string; token: Record<string, unknown> };
  data: unknown;
}) => Promise<ResolveResult>;

const TEACHER = { uid: 'teacher-1', token: { email: 't@orono.k12.mn.us' } };

beforeEach(() => {
  vi.clearAllMocks();
  sessionDoc = { exists: true, data: () => ({ teacherUid: 'teacher-1' }) };
  contextDocs = [];
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
    // First-page error → fetchNrpsMembers throws → resolver records the failure;
    // with no context successfully fetched it must surface, not return {}.
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

  it('unions members across multiple contexts (multi-section attach)', async () => {
    contextDocs = [
      {
        id: 'ctx-1',
        data: () => ({ contextMembershipsUrl: 'https://lms/m1' }),
      },
      {
        id: 'ctx-2',
        data: () => ({ contextMembershipsUrl: 'https://lms/m2' }),
      },
    ];
    vi.spyOn(nrpsNet, 'fetchMembershipPage').mockImplementation(
      async (url: string) => ({
        ok: true,
        status: 200,
        members:
          url === 'https://lms/m1'
            ? [{ user_id: 'sub-A', given_name: 'Ada', family_name: 'L' }]
            : [{ user_id: 'sub-C', given_name: 'Cy', family_name: 'P' }],
        nextUrl: null,
      })
    );

    const res = await callResolve({ auth: TEACHER, data: { sessionId: 's1' } });
    expect(Object.keys(res.names)).toHaveLength(2);
    expect(res.names[ltiStudentUid('sub-C', 'test-hmac-secret')]).toEqual({
      givenName: 'Cy',
      familyName: 'P',
    });
  });
});
