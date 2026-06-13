/**
 * Regression tests for ltiExchange — specifically the lti_grade_links write path.
 *
 * Regression (#1903-follow-up): ltiExchange wrote `contextId: launch.contextId`
 * unconditionally into `lti_grade_links/{uid}/resources/{rlId}`. When a
 * privacy-configured Schoology deployment relaunches without a context claim
 * (contextId: null), the `{ merge: true }` set explicitly overwrote the
 * previously-stored valid contextId with null — the same class of bug fixed
 * for contextTitle in nrpsStore.ts. The fix reads the existing doc and uses
 * `launch.contextId ?? storedDoc.contextId ?? null`.
 *
 * Only the lti_grade_links write path is exercised here; the full exchange flow
 * (JWT validation, custom-token mint, persistLtiLaunchContext) is mocked away.
 */

/* eslint-disable @typescript-eslint/require-await -- mock async handlers mirror
   the async Admin-SDK surface without awaiting anything. */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Lightweight Firestore mock ──────────────────────────────────────────────
// Tracks the last write to lti_grade_links docs so we can assert preservation.
interface GradeLinkDoc {
  sub?: string;
  contextId?: string | null;
  resourceLinkId?: string;
  ags?: unknown;
  updatedAt?: number;
}
const gradeLinkStore = new Map<string, GradeLinkDoc>();

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(() => ({
    doc: (path: string) => ({
      path,
      get: async () => {
        const data = gradeLinkStore.get(path);
        return { exists: !!data, data: () => data };
      },
      set: async (data: GradeLinkDoc) => {
        // Emulate Firestore merge: merge stored doc with incoming fields.
        const existing = gradeLinkStore.get(path) ?? {};
        gradeLinkStore.set(path, { ...existing, ...data });
      },
    }),
    collection: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }),
    batch: () => ({ set: vi.fn(), commit: async () => {} }),
  })),
  auth: vi.fn(() => ({
    createCustomToken: async () => 'custom-token',
  })),
}));

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
    onCall: (_o: unknown, handler: unknown) => handler,
    onRequest: (_o: unknown, handler: unknown) => handler,
    HttpsError,
  };
});

vi.mock('firebase-functions/params', () => ({
  defineSecret: () => ({ value: () => 'test-secret' }),
}));

// Provide a real-enough launch code store: consumeLaunchCode returns the
// launch we pre-seed via `nextLaunch`. The real stores.ts isn't needed here.
let nextLaunch: ReturnType<typeof makeLaunch> | null = null;
vi.mock('./stores', () => ({
  putOidcState: vi.fn(),
  consumeOidcState: vi.fn(),
  mintLaunchCode: vi.fn(),
  consumeLaunchCode: vi.fn(async () => nextLaunch),
  newOpaqueId: vi.fn(() => 'opaque-id'),
}));

// Stub persistLtiLaunchContext so we only test the grade-link write path.
vi.mock('./nrpsStore', () => ({
  persistLtiLaunchContext: vi.fn(async () => 'sess-1'),
  QUIZ_SESSIONS_COLLECTION: 'quiz_sessions',
  VIDEO_ACTIVITY_SESSIONS_COLLECTION: 'video_activity_sessions',
  LTI_SESSION_MEMBERSHIPS_COLLECTION: 'lti_session_memberships',
  USERS_COLLECTION: 'users',
  QUIZ_ASSIGNMENTS_SUBCOLLECTION: 'quiz_assignments',
  LTI_SEEN_SECTIONS_SUBCOLLECTION: 'lti_seen_sections',
}));

vi.mock('./identity', () => ({ ltiStudentUid: () => 'uid-student' }));

vi.mock('../classlinkShared', () => ({
  ALLOWED_ORIGINS: [],
  normalizeEmailDomain: () => 'school.edu',
  resolveOrgIdForDomain: async () => null,
}));

vi.mock('./config', async (orig) => ({
  ...(await orig<typeof import('./config')>()),
  getLtiPlatformConfig: vi.fn().mockResolvedValue({
    issuer: 'https://lms',
    clientId: 'c1',
    deploymentId: 'd1',
    authorizeUrl: 'https://lms/auth',
  }),
  TOOL_ORIGIN: 'https://app.example',
  TOOL_LAUNCH_URL: 'https://app.example/lti/launch',
  MESSAGE_TYPE_DEEP_LINKING: 'LtiDeepLinkingRequest',
}));

import { ltiExchange } from './launchEndpoints';

type Req = {
  auth?: { uid: string; token: Record<string, unknown> };
  data: unknown;
};
const callExchange = ltiExchange as unknown as (
  r: Req
) => Promise<Record<string, unknown>>;

function makeLaunch(
  overrides: Partial<{
    contextId: string | null;
    resourceLinkId: string | null;
    ags: unknown;
  }> = {}
) {
  return {
    role: 'student' as const,
    messageType: 'LtiResourceLinkRequest',
    sub: 'sub-1',
    deploymentId: 'dep-1',
    contextId: 'ctx-original' as string | null,
    contextTitle: 'Math 7' as string | null,
    resourceLinkId: 'rl-1' as string | null,
    ags: { lineitem: 'https://lms/lineitems/1', scope: [] } as unknown,
    nrps: null,
    deepLinking: null,
    custom: { kind: 'quiz', quiz_code: 'ABC123' } as Record<
      string,
      unknown
    > | null,
    email: null,
    name: null,
    ...overrides,
  };
}

beforeEach(() => {
  gradeLinkStore.clear();
  nextLaunch = null;
});

describe('ltiExchange — lti_grade_links null-clobber regression', () => {
  it('REGRESSION: does not overwrite a stored contextId with null on privacy-stripped relaunch', async () => {
    // First launch: student arrives with a full context (contextId = 'ctx-original').
    nextLaunch = makeLaunch({ contextId: 'ctx-original' });
    await callExchange({ data: { code: 'code-1' } });

    const path = 'lti_grade_links/uid-student/resources/rl-1';
    expect(gradeLinkStore.get(path)?.contextId).toBe('ctx-original');

    // Second launch: same student, same assignment, but the platform omits the
    // context claim (privacy-configured relaunch → contextId: null).
    nextLaunch = makeLaunch({ contextId: null });
    await callExchange({ data: { code: 'code-2' } });

    // The stored contextId MUST be preserved — null must not clobber the valid value.
    expect(gradeLinkStore.get(path)?.contextId).toBe('ctx-original');
  });

  it('writes the contextId on a fresh (first) launch', async () => {
    nextLaunch = makeLaunch({ contextId: 'ctx-new' });
    await callExchange({ data: { code: 'code-1' } });

    const path = 'lti_grade_links/uid-student/resources/rl-1';
    expect(gradeLinkStore.get(path)?.contextId).toBe('ctx-new');
  });

  it('accepts null contextId on a fresh launch (no stored value to preserve)', async () => {
    nextLaunch = makeLaunch({ contextId: null });
    await callExchange({ data: { code: 'code-1' } });

    const path = 'lti_grade_links/uid-student/resources/rl-1';
    // No stored value → null is the legitimate initial value.
    expect(gradeLinkStore.get(path)?.contextId).toBeNull();
  });
});
