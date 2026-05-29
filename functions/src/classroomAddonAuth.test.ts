/**
 * Tests for the classroomAddonLoginV1 SPIKE.
 *
 * The trust anchor is getAddOnContext, so the adversarial cases here pin the
 * single most important invariant: `studentRole` is minted ONLY when the
 * context carries `studentContext` — never for a teacher, an unknown launch,
 * or a bad access token.
 */

/* eslint-disable @typescript-eslint/require-await -- mock handlers return
   Promise-shaped values without awaiting, matching the async production APIs. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Configurable mock state (reset between tests).
let orgIdForDomain: string | null = 'org-orono';
let lastCustomTokenArgs: { uid: string; claims: unknown } | null = null;

vi.mock('firebase-admin', () => {
  return {
    apps: [{ name: '[DEFAULT]' }],
    initializeApp: vi.fn(),
    firestore: vi.fn(() => ({
      collectionGroup: () => ({
        where: () => ({
          where: () => ({
            limit: () => ({
              get: async () => {
                if (!orgIdForDomain) return { empty: true, docs: [] };
                return {
                  empty: false,
                  docs: [
                    {
                      ref: { parent: { parent: { id: orgIdForDomain } } },
                    },
                  ],
                };
              },
            }),
          }),
        }),
      }),
    })),
    auth: vi.fn(() => ({
      createCustomToken: async (uid: string, claims: unknown) => {
        lastCustomTokenArgs = { uid, claims };
        return `custom-token-for-${uid}`;
      },
    })),
  };
});

vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = 'HttpsError';
    }
  }
  return {
    // The mock returns the bare handler so tests can call it directly.
    onCall: (_options: unknown, handler: unknown) => handler,
    HttpsError,
  };
});

vi.mock('firebase-functions/params', () => ({
  defineSecret: () => ({ value: () => 'test-hmac-secret' }),
}));

// Imported AFTER the mocks so the module picks them up.
import {
  classroomAddonLoginV1,
  createClassroomAttachment,
  classroomAddonNet,
} from './classroomAddonAuth';

// In tests the onCall mock returns the raw handler, so this is callable.
const callLogin = classroomAddonLoginV1 as unknown as (req: {
  data: unknown;
}) => Promise<{
  role: string;
  studentRole: boolean;
  customToken?: string;
  submissionId?: string;
}>;

const STUDENT_CTX = {
  ok: true,
  status: 200,
  context: {
    courseId: 'C1',
    itemId: 'I1',
    supportsStudentWork: true,
    studentContext: { submissionId: 'SUB123' },
  },
};

const VALID_STUDENT_INFO = {
  sub: 'google-sub-1',
  email: 'kid@orono.k12.mn.us',
  email_verified: true,
};

const baseData = {
  accessToken: 'at',
  courseId: 'C1',
  itemId: 'I1',
  itemType: 'courseWork',
};

beforeEach(() => {
  orgIdForDomain = 'org-orono';
  lastCustomTokenArgs = null;
  vi.restoreAllMocks();
});

describe('classroomAddonLoginV1 (spike)', () => {
  it('mints a studentRole token when getAddOnContext returns studentContext', async () => {
    vi.spyOn(classroomAddonNet, 'fetchAddOnContext').mockResolvedValue(
      STUDENT_CTX
    );
    vi.spyOn(classroomAddonNet, 'fetchUserInfo').mockResolvedValue(
      VALID_STUDENT_INFO
    );

    const res = await callLogin({ data: baseData });

    expect(res.role).toBe('student');
    expect(res.studentRole).toBe(true);
    expect(res.customToken).toBeTruthy();
    expect(res.submissionId).toBe('SUB123');
    // Exact claim shape — must match studentLoginV1 / pinLoginV1.
    expect(lastCustomTokenArgs?.claims).toEqual({
      studentRole: true,
      orgId: 'org-orono',
      classIds: ['classroom:C1'],
    });
  });

  it('does NOT mint a student token for a teacher launch', async () => {
    vi.spyOn(classroomAddonNet, 'fetchAddOnContext').mockResolvedValue({
      ok: true,
      status: 200,
      context: { courseId: 'C1', itemId: 'I1', teacherContext: {} },
    });
    const userInfoSpy = vi
      .spyOn(classroomAddonNet, 'fetchUserInfo')
      .mockResolvedValue(VALID_STUDENT_INFO);

    const res = await callLogin({ data: baseData });

    expect(res.role).toBe('teacher');
    expect(res.studentRole).toBe(false);
    expect(res.customToken).toBeUndefined();
    expect(lastCustomTokenArgs).toBeNull();
    // Short-circuits before touching the identity/org path.
    expect(userInfoSpy).not.toHaveBeenCalled();
  });

  it('returns unknown (no token) when neither context is present', async () => {
    vi.spyOn(classroomAddonNet, 'fetchAddOnContext').mockResolvedValue({
      ok: true,
      status: 200,
      context: { courseId: 'C1', itemId: 'I1' },
    });

    const res = await callLogin({ data: baseData });

    expect(res.role).toBe('unknown');
    expect(res.studentRole).toBe(false);
    expect(lastCustomTokenArgs).toBeNull();
  });

  it('rejects when getAddOnContext fails (bad/expired access token)', async () => {
    vi.spyOn(classroomAddonNet, 'fetchAddOnContext').mockResolvedValue({
      ok: false,
      status: 401,
      context: null,
    });

    await expect(callLogin({ data: baseData })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    expect(lastCustomTokenArgs).toBeNull();
  });

  it('rejects an unregistered email domain (never mints an empty orgId)', async () => {
    orgIdForDomain = null; // domain not found
    vi.spyOn(classroomAddonNet, 'fetchAddOnContext').mockResolvedValue(
      STUDENT_CTX
    );
    vi.spyOn(classroomAddonNet, 'fetchUserInfo').mockResolvedValue({
      sub: 'google-sub-2',
      email: 'kid@unknown-school.org',
      email_verified: true,
    });

    await expect(callLogin({ data: baseData })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(lastCustomTokenArgs).toBeNull();
  });

  it('rejects a student context with no submissionId', async () => {
    vi.spyOn(classroomAddonNet, 'fetchAddOnContext').mockResolvedValue({
      ok: true,
      status: 200,
      context: {
        courseId: 'C1',
        itemId: 'I1',
        studentContext: {},
      },
    });

    await expect(callLogin({ data: baseData })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(lastCustomTokenArgs).toBeNull();
  });

  it('requires accessToken, courseId, and itemId', async () => {
    await expect(
      callLogin({ data: { courseId: 'C1', itemId: 'I1' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      callLogin({ data: { accessToken: 'at', itemId: 'I1' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

// createClassroomAttachment — teacher-discovery spike. The trust anchor is the
// same getAddOnContext call, but here the invariant flips: an attachment is
// created ONLY when the launch is a TEACHER. A student (or unknown) launch must
// never be able to create an attachment.
const callAttach = createClassroomAttachment as unknown as (req: {
  data: unknown;
}) => Promise<{ attachmentId: string }>;

const TEACHER_CTX = {
  ok: true,
  status: 200,
  context: { courseId: 'C1', itemId: 'I1', teacherContext: {} },
};

const attachData = {
  accessToken: 'teacher-at',
  courseId: 'C1',
  itemId: 'I1',
  itemType: 'courseWork',
  addOnToken: 'addon-tok',
  origin: 'https://spartboard.web.app',
};

describe('createClassroomAttachment (spike)', () => {
  it('creates an attachment for a teacher launch and returns its id', async () => {
    const ctxSpy = vi
      .spyOn(classroomAddonNet, 'fetchAddOnContext')
      .mockResolvedValue(TEACHER_CTX);
    const createSpy = vi
      .spyOn(classroomAddonNet, 'createAttachment')
      .mockResolvedValue({ ok: true, status: 200, id: 'ATT123' });

    const res = await callAttach({ data: attachData });

    expect(res.attachmentId).toBe('ATT123');
    // getAddOnContext must receive the addOnToken in the discovery iframe.
    expect(ctxSpy).toHaveBeenCalledWith(
      'teacher-at',
      'C1',
      'courseWork',
      'I1',
      'addon-tok'
    );
    // View URIs are derived from the validated origin, not client-supplied.
    const body = createSpy.mock.calls[0][5] as {
      teacherViewUri: { uri: string };
      studentViewUri: { uri: string };
    };
    expect(body.teacherViewUri.uri).toBe(
      'https://spartboard.web.app/classroom-addon/teacher'
    );
    expect(body.studentViewUri.uri).toBe(
      'https://spartboard.web.app/classroom-addon/student'
    );
  });

  it('refuses to create an attachment for a STUDENT launch', async () => {
    vi.spyOn(classroomAddonNet, 'fetchAddOnContext').mockResolvedValue(
      STUDENT_CTX
    );
    const createSpy = vi
      .spyOn(classroomAddonNet, 'createAttachment')
      .mockResolvedValue({ ok: true, status: 200, id: 'ATT123' });

    await expect(callAttach({ data: attachData })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    // The create call must NEVER fire for a non-teacher launch.
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('rejects when getAddOnContext fails (bad/expired teacher token)', async () => {
    vi.spyOn(classroomAddonNet, 'fetchAddOnContext').mockResolvedValue({
      ok: false,
      status: 401,
      context: null,
    });
    const createSpy = vi.spyOn(classroomAddonNet, 'createAttachment');

    await expect(callAttach({ data: attachData })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('rejects an origin that is not in the allowlist', async () => {
    const ctxSpy = vi.spyOn(classroomAddonNet, 'fetchAddOnContext');

    await expect(
      callAttach({
        data: { ...attachData, origin: 'https://evil.example.com' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    // Bad origin is rejected before any network call.
    expect(ctxSpy).not.toHaveBeenCalled();
  });

  it('requires accessToken, courseId, itemId, addOnToken, and origin', async () => {
    for (const missing of [
      'accessToken',
      'courseId',
      'itemId',
      'addOnToken',
      'origin',
    ] as const) {
      const data = { ...attachData };
      delete (data as Record<string, unknown>)[missing];
      await expect(callAttach({ data })).rejects.toMatchObject({
        code: 'invalid-argument',
      });
    }
  });

  it('surfaces an error when the attachment create call fails', async () => {
    vi.spyOn(classroomAddonNet, 'fetchAddOnContext').mockResolvedValue(
      TEACHER_CTX
    );
    vi.spyOn(classroomAddonNet, 'createAttachment').mockResolvedValue({
      ok: false,
      status: 500,
      id: null,
    });

    await expect(callAttach({ data: attachData })).rejects.toMatchObject({
      code: 'internal',
    });
  });
});

// Regression: every other test stubs fetchAddOnContext wholesale, so the real
// URL it builds was never exercised — which is exactly how a wrong REST path
// shipped. The method is named getAddOnContext, but the REST path segment is
// `addOnContext` (the `get` is the HTTP verb). A literal `/getAddOnContext`
// path resolves to nothing at Google's front end and returns a generic HTML
// 404, surfacing as the opaque "Could not validate the Classroom launch".
describe('classroomAddonNet.fetchAddOnContext URL construction', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs the /addOnContext REST path (not the literal method name)', async () => {
    let calledUrl = '';
    const fetchMock = vi.fn(async (url: unknown) => {
      calledUrl = url as string;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          courseId: 'C1',
          itemId: 'I1',
          teacherContext: {},
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await classroomAddonNet.fetchAddOnContext(
      'tok',
      'C1',
      'courseWork',
      'I1',
      'addon-tok'
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calledUrl).toContain(
      'https://classroom.googleapis.com/v1/courses/C1/courseWork/I1/addOnContext'
    );
    // The literal method name must NOT appear in the path.
    expect(calledUrl).not.toContain('/getAddOnContext');
    // addOnToken is passed as a query param when present.
    expect(calledUrl).toContain('addOnToken=addon-tok');
  });
});
