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
import * as CryptoJS from 'crypto-js';

// Configurable mock state (reset between tests).
let orgIdForDomain: string | null = 'org-orono';
let lastCustomTokenArgs: { uid: string; claims: unknown } | null = null;
// Course-link doc returned by `db.doc('classroom_course_links/...').get()`.
// null = not linked (the common case → bridge falls back to the nameless path).
let courseLinkDoc: {
  classlinkClassId?: string;
  classlinkOrgId?: string;
  teacherUid?: string;
} | null = null;

// Captures every `db.doc(path).set(data, opts)` so tests can assert what was
// persisted (and prove the PII gate — no name/email in any write).
const firestoreWrites: Array<{ path: string; data: Record<string, unknown> }> =
  [];
// Pre-seeded grade-sync key docs, keyed by full path, read by pushClassroomGrade.
const gradeSyncDocs = new Map<string, Record<string, unknown>>();

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
      // Path-aware doc(): the course-link read returns `courseLinkDoc`; the
      // grade-sync key read returns a pre-seeded entry from `gradeSyncDocs`;
      // `.set()` records into `firestoreWrites` for assertions.
      doc: (path: string) => ({
        get: async () => {
          if (path.startsWith('classroom_course_links/')) {
            return {
              exists: courseLinkDoc !== null,
              data: () => courseLinkDoc,
            };
          }
          const seeded = gradeSyncDocs.get(path);
          return {
            exists: seeded !== undefined,
            data: () => seeded,
          };
        },
        set: async (data: Record<string, unknown>) => {
          firestoreWrites.push({ path, data });
        },
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
  pushClassroomGrade,
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
  courseLinkDoc = null;
  firestoreWrites.length = 0;
  gradeSyncDocs.clear();
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

  it('bridges to the ClassLink sourcedId uid + classId when the course is linked and the student is in the roster', async () => {
    courseLinkDoc = {
      classlinkClassId: 'CL-SECTION-1',
      classlinkOrgId: 'orono',
    };
    vi.spyOn(classroomAddonNet, 'fetchAddOnContext').mockResolvedValue(
      STUDENT_CTX
    );
    vi.spyOn(classroomAddonNet, 'fetchUserInfo').mockResolvedValue(
      VALID_STUDENT_INFO
    );
    const studentsSpy = vi
      .spyOn(classroomAddonNet, 'fetchClassStudents')
      .mockResolvedValue([
        { sourcedId: 'SID-OTHER', email: 'nope@orono.k12.mn.us' },
        {
          sourcedId: 'SID-XYZ',
          email: 'kid@orono.k12.mn.us',
          givenName: 'Kid',
          familyName: 'One',
        },
      ]);

    const res = await callLogin({ data: baseData });

    expect(res.role).toBe('student');
    expect(res.studentRole).toBe(true);
    // The class roster for the LINKED classId is what we fetch.
    expect(studentsSpy).toHaveBeenCalledWith(
      'test-hmac-secret',
      'test-hmac-secret',
      'test-hmac-secret',
      'CL-SECTION-1'
    );
    // uid MUST equal HMAC("sid:<sourcedId>") so it matches ClassLink SSO and the
    // teacher monitor (getPseudonymsForAssignmentV1) resolves the real name.
    const expectedUid = CryptoJS.HmacSHA256(
      'sid:SID-XYZ',
      'test-hmac-secret'
    ).toString(CryptoJS.enc.Hex);
    expect(lastCustomTokenArgs?.uid).toBe(expectedUid);
    expect(lastCustomTokenArgs?.claims).toEqual({
      studentRole: true,
      orgId: 'org-orono',
      classIds: ['CL-SECTION-1'],
    });
  });

  it('falls back to the nameless pseudonym when linked but the student is not in the roster', async () => {
    courseLinkDoc = {
      classlinkClassId: 'CL-SECTION-1',
      classlinkOrgId: 'orono',
    };
    vi.spyOn(classroomAddonNet, 'fetchAddOnContext').mockResolvedValue(
      STUDENT_CTX
    );
    vi.spyOn(classroomAddonNet, 'fetchUserInfo').mockResolvedValue(
      VALID_STUDENT_INFO
    );
    vi.spyOn(classroomAddonNet, 'fetchClassStudents').mockResolvedValue([
      { sourcedId: 'SID-OTHER', email: 'someone-else@orono.k12.mn.us' },
    ]);

    const res = await callLogin({ data: baseData });

    expect(res.studentRole).toBe(true);
    const fallbackUid = CryptoJS.HmacSHA256(
      'classroom-sub:google-sub-1',
      'test-hmac-secret'
    ).toString(CryptoJS.enc.Hex);
    expect(lastCustomTokenArgs?.uid).toBe(fallbackUid);
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

  it('forwards attachmentId to getAddOnContext (the student view requires it)', async () => {
    const ctxSpy = vi
      .spyOn(classroomAddonNet, 'fetchAddOnContext')
      .mockResolvedValue(STUDENT_CTX);
    vi.spyOn(classroomAddonNet, 'fetchUserInfo').mockResolvedValue(
      VALID_STUDENT_INFO
    );

    await callLogin({ data: { ...baseData, attachmentId: 'ATT1' } });

    // The student launch has no addOnToken (5th arg undefined) but must pass
    // attachmentId (6th arg).
    expect(ctxSpy).toHaveBeenCalledWith(
      'at',
      'C1',
      'courseWork',
      'I1',
      undefined,
      'ATT1'
    );
  });

  it('persists a PII-free grade-sync key keyed by the student pseudonym', async () => {
    // Linked course → bridge resolves the sourcedId pseudonym AND records the
    // linking teacher for the offline-creds grade push.
    courseLinkDoc = {
      classlinkClassId: 'CL-SECTION-1',
      classlinkOrgId: 'orono',
      teacherUid: 'teacher-123',
    };
    vi.spyOn(classroomAddonNet, 'fetchAddOnContext').mockResolvedValue(
      STUDENT_CTX
    );
    vi.spyOn(classroomAddonNet, 'fetchUserInfo').mockResolvedValue(
      VALID_STUDENT_INFO
    );
    vi.spyOn(classroomAddonNet, 'fetchClassStudents').mockResolvedValue([
      {
        sourcedId: 'SID-XYZ',
        email: 'kid@orono.k12.mn.us',
        givenName: 'Kid',
        familyName: 'One',
      },
    ]);

    await callLogin({ data: { ...baseData, attachmentId: 'ATT1' } });

    const expectedUid = CryptoJS.HmacSHA256(
      'sid:SID-XYZ',
      'test-hmac-secret'
    ).toString(CryptoJS.enc.Hex);

    // The grade-sync key is written under the pseudonym uid, one sub-doc per
    // submission, with ONLY Classroom/Firebase ids — never a name or email.
    const gradeWrite = firestoreWrites.find((w) =>
      w.path.startsWith('classroom_grade_links/')
    );
    expect(gradeWrite).toBeDefined();
    expect(gradeWrite?.path).toBe(
      `classroom_grade_links/${expectedUid}/submissions/SUB123`
    );
    expect(gradeWrite?.data).toMatchObject({
      courseId: 'C1',
      itemId: 'I1',
      attachmentId: 'ATT1',
      submissionId: 'SUB123',
      teacherUid: 'teacher-123',
    });

    // PII gate: no name/email field anywhere in the persisted payload.
    const serialized = JSON.stringify(gradeWrite?.data);
    expect(serialized).not.toContain('kid@orono.k12.mn.us');
    expect(serialized).not.toMatch(/givenName|familyName|email|name/i);
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
  quizCode: 'ABC123',
  title: 'SpartBoard: My Quiz',
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
      title: string;
      teacherViewUri: { uri: string };
      studentViewUri: { uri: string };
      studentWorkReviewUri?: { uri: string };
      maxPoints?: number;
    };
    expect(body.teacherViewUri.uri).toBe(
      'https://spartboard.web.app/classroom-addon/teacher'
    );
    // The studentViewUri carries the quiz join code so the student route can
    // hand it to QuizStudentApp (which SSO-auto-joins by ?code=). `code` MUST
    // remain present for back-compat; `&kind=quiz` is appended but optional.
    expect(body.studentViewUri.uri).toContain('code=ABC123');
    expect(body.studentViewUri.uri).toBe(
      'https://spartboard.web.app/classroom-addon/student?code=ABC123&kind=quiz'
    );
    // The client-supplied title is used (capped/sanitized server-side).
    expect(body.title).toBe('SpartBoard: My Quiz');
    // Grade-sync capable: courseWork attachments carry studentWorkReviewUri +
    // a non-zero maxPoints (added together; maxPoints is invalid without the
    // review uri). Defaults to 100 when the teacher supplies none.
    expect(body.studentWorkReviewUri?.uri).toBe(body.studentViewUri.uri);
    expect(body.maxPoints).toBe(100);
  });

  it('builds a video-activity studentViewUri (?kind=va&sessionId=) and respects supplied maxPoints', async () => {
    vi.spyOn(classroomAddonNet, 'fetchAddOnContext').mockResolvedValue(
      TEACHER_CTX
    );
    const createSpy = vi
      .spyOn(classroomAddonNet, 'createAttachment')
      .mockResolvedValue({ ok: true, status: 200, id: 'ATT-VA' });

    const data = {
      ...attachData,
      kind: 'va',
      sessionId: 'sess_AB-12',
      maxPoints: 50,
    };
    delete (data as Record<string, unknown>).quizCode;
    const res = await callAttach({ data });

    expect(res.attachmentId).toBe('ATT-VA');
    const body = createSpy.mock.calls[0][5] as {
      studentViewUri: { uri: string };
      studentWorkReviewUri?: { uri: string };
      maxPoints?: number;
    };
    expect(body.studentViewUri.uri).toBe(
      'https://spartboard.web.app/classroom-addon/student?kind=va&sessionId=sess_AB-12'
    );
    // No `code=` for the VA runner.
    expect(body.studentViewUri.uri).not.toContain('code=');
    expect(body.studentWorkReviewUri?.uri).toBe(body.studentViewUri.uri);
    expect(body.maxPoints).toBe(50);
  });

  it('throws when the required identifier for the chosen kind is missing', async () => {
    const ctxSpy = vi.spyOn(classroomAddonNet, 'fetchAddOnContext');
    const createSpy = vi.spyOn(classroomAddonNet, 'createAttachment');

    // kind 'va' without a sessionId.
    const vaData = { ...attachData, kind: 'va' };
    delete (vaData as Record<string, unknown>).quizCode;
    await expect(callAttach({ data: vaData })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    // kind 'quiz' (explicit) without a quizCode.
    const quizData = { ...attachData, kind: 'quiz' };
    delete (quizData as Record<string, unknown>).quizCode;
    await expect(callAttach({ data: quizData })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    // Both rejected before any network call.
    expect(ctxSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('requires a quizCode and rejects a malformed one', async () => {
    const ctxSpy = vi
      .spyOn(classroomAddonNet, 'fetchAddOnContext')
      .mockResolvedValue(TEACHER_CTX);
    const createSpy = vi.spyOn(classroomAddonNet, 'createAttachment');

    // Non-alphanumeric quizCode is rejected before any network call.
    await expect(
      callAttach({ data: { ...attachData, quizCode: 'a/../b' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(ctxSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('defaults the title when none is supplied', async () => {
    vi.spyOn(classroomAddonNet, 'fetchAddOnContext').mockResolvedValue(
      TEACHER_CTX
    );
    const createSpy = vi
      .spyOn(classroomAddonNet, 'createAttachment')
      .mockResolvedValue({ ok: true, status: 200, id: 'ATT123' });

    const data = { ...attachData };
    delete (data as Record<string, unknown>).title;
    await callAttach({ data });

    const body = createSpy.mock.calls[0][5] as { title: string };
    expect(body.title.length).toBeGreaterThan(0);
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
      'quizCode',
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

  it('sends attachmentId (and no addOnToken) for a student-view launch', async () => {
    let calledUrl = '';
    const fetchMock = vi.fn(async (url: unknown) => {
      calledUrl = url as string;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          courseId: 'C1',
          itemId: 'I1',
          studentContext: { submissionId: 'S1' },
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    // Student/teacher view launches have no addOnToken but DO carry an
    // attachmentId, which getAddOnContext requires (else 400 INVALID_ARGUMENT
    // "Attachment ID must be specified.").
    await classroomAddonNet.fetchAddOnContext(
      'tok',
      'C1',
      'courseWork',
      'I1',
      undefined,
      'ATT1'
    );

    expect(calledUrl).toContain('/courseWork/I1/addOnContext');
    expect(calledUrl).toContain('attachmentId=ATT1');
    expect(calledUrl).not.toContain('addOnToken');
  });
});

// pushClassroomGrade — DRAFT grade passback. The grade PATCH goes through the
// `patchStudentSubmissionGrade` seam (stubbed here) and the access token is
// minted from the linking teacher's OFFLINE creds via `refreshOfflineAccessToken`
// (also stubbed) — so the callable is testable with no live Classroom/Google.
const callPushGrade = pushClassroomGrade as unknown as (req: {
  data: unknown;
}) => Promise<{ ok: boolean; pointsEarned: number }>;

const gradeData = {
  courseId: 'C1',
  itemId: 'I1',
  attachmentId: 'ATT1',
  submissionId: 'SUB123',
  teacherUid: 'teacher-123',
  pointsEarned: 8,
};

describe('pushClassroomGrade', () => {
  it('refreshes offline creds and PATCHes the submission with the rounded score', async () => {
    const refreshSpy = vi
      .spyOn(classroomAddonNet, 'refreshOfflineAccessToken')
      .mockResolvedValue('fresh-teacher-token');
    const patchSpy = vi
      .spyOn(classroomAddonNet, 'patchStudentSubmissionGrade')
      .mockResolvedValue({ ok: true, status: 200 });

    const res = await callPushGrade({
      data: { ...gradeData, pointsEarned: 7.6 },
    });

    expect(res).toEqual({ ok: true, pointsEarned: 8 });
    // Offline creds are minted for the LINKING teacher (no teacher present).
    expect(refreshSpy).toHaveBeenCalledWith('teacher-123');
    // PATCH receives the refreshed token + full submission tuple + rounded score.
    expect(patchSpy).toHaveBeenCalledWith(
      'fresh-teacher-token',
      'C1',
      'I1',
      'ATT1',
      'SUB123',
      8
    );
  });

  it('resolves the submission tuple from the persisted grade-sync key (pseudonym shape)', async () => {
    const expectedUid = 'pseudo-uid-1';
    gradeSyncDocs.set(
      `classroom_grade_links/${expectedUid}/submissions/SUB123`,
      {
        courseId: 'C9',
        itemId: 'I9',
        attachmentId: 'ATT9',
        submissionId: 'SUB123',
        teacherUid: 'teacher-999',
      }
    );
    const refreshSpy = vi
      .spyOn(classroomAddonNet, 'refreshOfflineAccessToken')
      .mockResolvedValue('tok9');
    const patchSpy = vi
      .spyOn(classroomAddonNet, 'patchStudentSubmissionGrade')
      .mockResolvedValue({ ok: true, status: 200 });

    const res = await callPushGrade({
      data: {
        pseudonymUid: expectedUid,
        submissionId: 'SUB123',
        pointsEarned: 5,
      },
    });

    expect(res.ok).toBe(true);
    expect(refreshSpy).toHaveBeenCalledWith('teacher-999');
    expect(patchSpy).toHaveBeenCalledWith(
      'tok9',
      'C9',
      'I9',
      'ATT9',
      'SUB123',
      5
    );
  });

  it('issues the correct PATCH URL, updateMask, and body (real seam)', async () => {
    // Exercise the real patchStudentSubmissionGrade against a stubbed fetch so
    // the URL/updateMask/body it builds are pinned (mirrors the addOnContext
    // URL-construction regression test).
    let calledUrl = '';
    let calledInit: { method?: string; body?: string } = {};
    const fetchMock = vi.fn(async (url: unknown, init: unknown) => {
      calledUrl = url as string;
      calledInit = init as { method?: string; body?: string };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await classroomAddonNet.patchStudentSubmissionGrade(
      'tok',
      'C1',
      'I1',
      'ATT1',
      'SUB123',
      8
    );

    expect(result).toEqual({ ok: true, status: 200 });
    expect(calledUrl).toBe(
      'https://classroom.googleapis.com/v1/courses/C1/courseWork/I1' +
        '/addOnAttachments/ATT1/studentSubmissions/SUB123?updateMask=pointsEarned'
    );
    expect(calledInit.method).toBe('PATCH');
    expect(JSON.parse(calledInit.body ?? '{}')).toEqual({ pointsEarned: 8 });
    vi.unstubAllGlobals();
  });

  it('rejects a missing submissionId or a negative score before any network call', async () => {
    const refreshSpy = vi.spyOn(classroomAddonNet, 'refreshOfflineAccessToken');
    const patchSpy = vi.spyOn(classroomAddonNet, 'patchStudentSubmissionGrade');

    await expect(
      callPushGrade({ data: { ...gradeData, submissionId: '' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      callPushGrade({ data: { ...gradeData, pointsEarned: -1 } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(refreshSpy).not.toHaveBeenCalled();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('throws failed-precondition when no linking teacher can be resolved', async () => {
    const refreshSpy = vi.spyOn(classroomAddonNet, 'refreshOfflineAccessToken');
    // Full tuple but no teacherUid, and no grade-sync key to fill it in.
    const data = { ...gradeData };
    delete (data as Record<string, unknown>).teacherUid;

    await expect(callPushGrade({ data })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('surfaces an internal error when the upstream PATCH fails', async () => {
    vi.spyOn(classroomAddonNet, 'refreshOfflineAccessToken').mockResolvedValue(
      'tok'
    );
    vi.spyOn(
      classroomAddonNet,
      'patchStudentSubmissionGrade'
    ).mockResolvedValue({ ok: false, status: 403 });

    await expect(callPushGrade({ data: gradeData })).rejects.toMatchObject({
      code: 'internal',
    });
  });

  it('propagates the needs-consent error contract from offline token refresh', async () => {
    // refreshOfflineAccessToken → refreshGoogleAccessTokenForUid throws an
    // HttpsError (e.g. revoked grant). pushClassroomGrade must pass it through
    // unchanged rather than masking it as a generic internal error.
    const { HttpsError } = await import('firebase-functions/v2/https');
    vi.spyOn(classroomAddonNet, 'refreshOfflineAccessToken').mockRejectedValue(
      new HttpsError('failed-precondition', 'needs-consent: revoked', {
        reason: 'needs-consent',
        cause: 'invalid-grant',
      })
    );
    const patchSpy = vi.spyOn(classroomAddonNet, 'patchStudentSubmissionGrade');

    await expect(callPushGrade({ data: gradeData })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(patchSpy).not.toHaveBeenCalled();
  });
});
