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
// Captures every `db.doc(path).delete()` (the unlinkClassroomCourse path).
const firestoreDeletes: Array<{ path: string }> = [];
// Counts `db.runTransaction(...)` invocations so the link/unlink tests can pin
// that the write/delete now happens inside a transaction (the TOCTOU fix), not a
// bare read-then-write.
let transactionCount = 0;

// Minimal structural shapes for the transactional mock below. The real Admin SDK
// is replaced wholesale by this mock at runtime, so these only need to be
// internally consistent — the production file is type-checked against the real
// firebase-admin types separately.
interface DocSnapshotMock {
  exists: boolean;
  data: () => unknown;
}
interface DocRefMock {
  get: () => Promise<DocSnapshotMock>;
  set: (data: Record<string, unknown>, opts?: unknown) => Promise<void>;
  delete: () => Promise<void>;
}
interface TxMock {
  get: (ref: DocRefMock) => Promise<DocSnapshotMock>;
  set: (ref: DocRefMock, data: Record<string, unknown>, opts?: unknown) => void;
  delete: (ref: DocRefMock) => void;
}
// Pre-seeded grade-sync key docs, keyed by full path, exercised by the
// classroomAddonLoginV1 grade-sync persistence test.
const gradeSyncDocs = new Map<string, Record<string, unknown>>();
// Pre-seeded submission docs for the BATCH `db.collection(...).where(...)`
// query, keyed by the submissions subcollection path
// (`classroom_grade_links/{pseudonymUid}/submissions`). Each entry is the list
// of submission docs that subcollection contains; the mock applies the
// `.where('attachmentId','==',x)` filter and `.limit(1)` against this list.
const submissionsByPath = new Map<string, Record<string, unknown>[]>();

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
      // Path-aware collection(): the BATCH callable queries the submissions
      // subcollection (`classroom_grade_links/{uid}/submissions`) by
      // `.where('attachmentId','==',x).limit(1)`. The mock filters the seeded
      // `submissionsByPath` list by the queried field/value and caps it.
      collection: (path: string) => {
        const makeQuery = (
          filters: Array<{ field: string; value: unknown }>,
          cap: number | null
        ) => ({
          where: (field: string, _op: string, value: unknown) =>
            makeQuery([...filters, { field, value }], cap),
          limit: (n: number) => makeQuery(filters, n),
          get: async () => {
            const all = submissionsByPath.get(path) ?? [];
            let matched = all.filter((d) =>
              filters.every((f) => d[f.field] === f.value)
            );
            if (cap !== null) matched = matched.slice(0, cap);
            return {
              empty: matched.length === 0,
              docs: matched.map((d) => ({ data: () => d })),
            };
          },
        });
        return makeQuery([], null);
      },
      // Path-aware doc(): the course-link read returns `courseLinkDoc`; the
      // grade-sync key read returns a pre-seeded entry from `gradeSyncDocs`;
      // `.set()` records into `firestoreWrites` and `.delete()` into
      // `firestoreDeletes` for assertions.
      doc: (path: string): DocRefMock => ({
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
        delete: async () => {
          firestoreDeletes.push({ path });
        },
      }),
      // Transaction mock: delegates each tx op to the ref's own method (the same
      // `db.doc(path)` objects above), so a transactional read-then-write/delete
      // records into the same `firestoreWrites` / `firestoreDeletes` arrays the
      // non-transactional path used. Runs the body once (no contention retries),
      // returning whatever it resolves to — matching runTransaction's contract.
      runTransaction: async <T>(
        updateFn: (tx: TxMock) => Promise<T>
      ): Promise<T> => {
        transactionCount += 1;
        const tx: TxMock = {
          get: (ref) => ref.get(),
          set: (ref, txData, opts) => {
            void ref.set(txData, opts);
          },
          delete: (ref) => {
            void ref.delete();
          },
        };
        return updateFn(tx);
      },
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
  linkClassroomCourse,
  unlinkClassroomCourse,
  pushClassroomGradesForAssignment,
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
  firestoreDeletes.length = 0;
  transactionCount = 0;
  gradeSyncDocs.clear();
  submissionsByPath.clear();
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
    // Carries BOTH the ClassLink sourcedId AND the courseId-scoped id. The
    // sourcedId bridges name resolution + regular-SSO roster-mates; the
    // `classroom:<courseId>` entry guarantees the Firestore class-gate overlaps
    // for every Classroom-verified course member regardless of how the
    // assignment was targeted (or link timing), so a roster gap can't block them.
    expect(lastCustomTokenArgs?.claims).toEqual({
      studentRole: true,
      orgId: 'org-orono',
      classIds: ['CL-SECTION-1', 'classroom:C1'],
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
    // The teacher view now carries the SAME content ref as the student view so
    // the iframe can resolve the session and render the in-place grading view.
    expect(body.teacherViewUri.uri).toBe(
      'https://spartboard.web.app/classroom-addon/teacher?code=ABC123&kind=quiz'
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
    // studentWorkReviewUri must point at the TEACHER grader (where Classroom
    // sends a teacher reviewing a student's submitted work), NOT the student
    // runner — otherwise the teacher loops on the student sign-in screen.
    expect(body.studentWorkReviewUri?.uri).toBe(body.teacherViewUri.uri);
    expect(body.maxPoints).toBe(100);
  });

  it('builds a video-activity studentViewUri (?kind=va&sessionId=) and respects the supplied maxPoints', async () => {
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
      // VA grade push is wired (mirrors the quiz path), so a supplied maxPoints
      // is honored on the gradeable slot.
      maxPoints: 50,
    };
    delete (data as Record<string, unknown>).quizCode;
    const res = await callAttach({ data });

    expect(res.attachmentId).toBe('ATT-VA');
    const body = createSpy.mock.calls[0][5] as {
      studentViewUri: { uri: string };
      teacherViewUri: { uri: string };
      studentWorkReviewUri?: { uri: string };
      maxPoints?: number;
    };
    expect(body.studentViewUri.uri).toBe(
      'https://spartboard.web.app/classroom-addon/student?kind=va&sessionId=sess_AB-12'
    );
    // The teacher view carries the same VA content ref for in-place review.
    expect(body.teacherViewUri.uri).toBe(
      'https://spartboard.web.app/classroom-addon/teacher?kind=va&sessionId=sess_AB-12'
    );
    // No `code=` for the VA runner.
    expect(body.studentViewUri.uri).not.toContain('code=');
    // VA courseWork IS grade-sync capable: studentWorkReviewUri is present and
    // maxPoints reflects the supplied value (grade push is wired for VA too).
    // studentWorkReviewUri must point at the TEACHER grader (where Classroom
    // sends a teacher reviewing a student's submitted work), NOT the student
    // runner — otherwise the teacher loops on the student sign-in screen.
    expect(body.studentWorkReviewUri?.uri).toBe(body.teacherViewUri.uri);
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

// linkClassroomCourse — server-gated creator of classroom_course_links/{courseId}.
// The trust anchor is listTeacherCourseIds (the caller's OWN teacher course
// list): the chosen courseId MUST appear there, or the link is refused. These
// tests pin the squatting fix — a non-teacher can't claim a course, teacherUid
// is always the authenticated caller (never the client payload), and an existing
// link owned by a different teacher is never overwritten.
const callLink = linkClassroomCourse as unknown as (req: {
  data: unknown;
  auth?: { uid: string } | null;
}) => Promise<{ ok: boolean; courseId: string }>;

const linkData = {
  accessToken: 'teacher-courses-token',
  courseId: 'C1',
  classlinkClassId: 'CL-SECTION-1',
  classlinkOrgId: 'orono',
  rosterId: 'roster-1',
};

function findLinkWrite() {
  return firestoreWrites.find((w) => w.path === 'classroom_course_links/C1');
}

describe('linkClassroomCourse (course-squatting fix)', () => {
  it('writes the link for a verified teacher of the course', async () => {
    const listSpy = vi
      .spyOn(classroomAddonNet, 'listTeacherCourseIds')
      .mockResolvedValue({ ok: true, status: 200, courseIds: ['C0', 'C1'] });

    const res = await callLink({
      data: linkData,
      auth: { uid: 'teacher-1' },
    });

    expect(res).toMatchObject({ ok: true, courseId: 'C1' });
    expect(listSpy).toHaveBeenCalledWith('teacher-courses-token');
    const write = findLinkWrite();
    expect(write?.data).toMatchObject({
      classlinkClassId: 'CL-SECTION-1',
      classlinkOrgId: 'orono',
      teacherUid: 'teacher-1',
      rosterId: 'roster-1',
    });
    // First create stamps both timestamps.
    expect(typeof write?.data.createdAt).toBe('number');
    expect(typeof write?.data.updatedAt).toBe('number');
  });

  it('performs the no-hijack check + write inside a transaction (TOCTOU fix)', async () => {
    vi.spyOn(classroomAddonNet, 'listTeacherCourseIds').mockResolvedValue({
      ok: true,
      status: 200,
      courseIds: ['C1'],
    });

    await callLink({ data: linkData, auth: { uid: 'teacher-1' } });

    // The check-then-write must be atomic: two co-teachers racing to link the
    // same never-linked course can't both pass the "exists?" check and clobber
    // each other. Pinning that a transaction wraps the write guards the fix.
    expect(transactionCount).toBe(1);
    expect(findLinkWrite()?.data.teacherUid).toBe('teacher-1');
  });

  it('refuses to link a course the caller does not teach (squat attempt)', async () => {
    vi.spyOn(classroomAddonNet, 'listTeacherCourseIds').mockResolvedValue({
      ok: true,
      status: 200,
      // The caller teaches OTHER courses, but NOT the courseId they're claiming.
      courseIds: ['SOME-OTHER-COURSE'],
    });

    await expect(
      callLink({ data: linkData, auth: { uid: 'squatter' } })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(findLinkWrite()).toBeUndefined();
  });

  it('always records teacherUid from the authenticated caller, never the client payload', async () => {
    vi.spyOn(classroomAddonNet, 'listTeacherCourseIds').mockResolvedValue({
      ok: true,
      status: 200,
      courseIds: ['C1'],
    });

    await callLink({
      // A malicious client tries to set someone else as the owner.
      data: { ...linkData, teacherUid: 'victim-teacher' },
      auth: { uid: 'real-caller' },
    });

    expect(findLinkWrite()?.data.teacherUid).toBe('real-caller');
  });

  it('refuses to overwrite a link owned by a different teacher (no hijack)', async () => {
    courseLinkDoc = {
      classlinkClassId: 'CL-OTHER',
      teacherUid: 'original-teacher',
    };
    // Even a genuine co-teacher (passes the teacher check) can't steal it.
    vi.spyOn(classroomAddonNet, 'listTeacherCourseIds').mockResolvedValue({
      ok: true,
      status: 200,
      courseIds: ['C1'],
    });

    await expect(
      callLink({ data: linkData, auth: { uid: 'co-teacher' } })
    ).rejects.toMatchObject({ code: 'already-exists' });
    expect(findLinkWrite()).toBeUndefined();
  });

  it('lets the SAME teacher re-link (update) without resetting createdAt', async () => {
    courseLinkDoc = {
      classlinkClassId: 'CL-OLD',
      teacherUid: 'teacher-1',
      createdAt: 111,
    } as Record<string, unknown>;
    vi.spyOn(classroomAddonNet, 'listTeacherCourseIds').mockResolvedValue({
      ok: true,
      status: 200,
      courseIds: ['C1'],
    });

    await callLink({ data: linkData, auth: { uid: 'teacher-1' } });

    const write = findLinkWrite();
    expect(write?.data.teacherUid).toBe('teacher-1');
    expect(write?.data.classlinkClassId).toBe('CL-SECTION-1');
    // createdAt is only set on first create; a re-link must not stamp it (merge
    // preserves the original).
    expect(write?.data.createdAt).toBeUndefined();
    expect(typeof write?.data.updatedAt).toBe('number');
  });

  it('fails closed when the teacher course-list check errors (never links on an unverifiable token)', async () => {
    vi.spyOn(classroomAddonNet, 'listTeacherCourseIds').mockResolvedValue({
      ok: false,
      status: 401,
      courseIds: [],
    });

    await expect(
      callLink({ data: linkData, auth: { uid: 'teacher-1' } })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(findLinkWrite()).toBeUndefined();
  });

  it('rejects an unauthenticated caller before any Classroom call', async () => {
    const listSpy = vi.spyOn(classroomAddonNet, 'listTeacherCourseIds');

    await expect(
      callLink({ data: linkData, auth: null })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(listSpy).not.toHaveBeenCalled();
    expect(findLinkWrite()).toBeUndefined();
  });

  it('requires accessToken and courseId', async () => {
    await expect(
      callLink({
        data: { ...linkData, accessToken: '' },
        auth: { uid: 'teacher-1' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      callLink({
        data: { ...linkData, courseId: '' },
        auth: { uid: 'teacher-1' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

// unlinkClassroomCourse — the correction path for a wrong/stale course→roster
// mapping. Same trust anchor as linkClassroomCourse (the caller's OWN teacher
// course list), but it REMOVES the link rather than creating it. These tests pin
// the documented decision (a verified co-teacher CAN take over / remove a
// departed teacher's link) and the preserved squatting-fix invariants: a
// non-teacher can never delete, verification failures fail closed, and the
// delete runs inside a transaction.
const callUnlink = unlinkClassroomCourse as unknown as (req: {
  data: unknown;
  auth?: { uid: string } | null;
}) => Promise<{ ok: boolean; courseId: string; removed: boolean }>;

const unlinkData = {
  accessToken: 'teacher-courses-token',
  courseId: 'C1',
};

function findLinkDelete() {
  return firestoreDeletes.find((d) => d.path === 'classroom_course_links/C1');
}

describe('unlinkClassroomCourse (correction path)', () => {
  it('removes a link the caller owns (verified teacher), inside a transaction', async () => {
    courseLinkDoc = {
      classlinkClassId: 'CL-SECTION-1',
      teacherUid: 'teacher-1',
    };
    const listSpy = vi
      .spyOn(classroomAddonNet, 'listTeacherCourseIds')
      .mockResolvedValue({ ok: true, status: 200, courseIds: ['C0', 'C1'] });

    const res = await callUnlink({
      data: unlinkData,
      auth: { uid: 'teacher-1' },
    });

    expect(res).toMatchObject({ ok: true, courseId: 'C1', removed: true });
    // Teaching authority is re-verified server-side with the caller's own token.
    expect(listSpy).toHaveBeenCalledWith('teacher-courses-token');
    // The delete is transactional (deterministic vs a concurrent link/unlink).
    expect(transactionCount).toBe(1);
    expect(findLinkDelete()).toBeDefined();
  });

  it('lets a verified CO-TEACHER remove a departed teacher’s link (documented takeover)', async () => {
    // The link is owned by a DIFFERENT teacher (e.g. one who left the district).
    courseLinkDoc = {
      classlinkClassId: 'CL-SECTION-1',
      teacherUid: 'departed-teacher',
    };
    // The caller is a co-teacher who genuinely teaches the course.
    vi.spyOn(classroomAddonNet, 'listTeacherCourseIds').mockResolvedValue({
      ok: true,
      status: 200,
      courseIds: ['C1'],
    });

    const res = await callUnlink({
      data: unlinkData,
      auth: { uid: 'co-teacher' },
    });

    // Unlike linkClassroomCourse (which refuses a different teacher with
    // `already-exists`), unlink is the EXPLICIT correction path: a verified
    // co-teacher of the SAME course may remove the link.
    expect(res).toMatchObject({ ok: true, removed: true });
    expect(findLinkDelete()).toBeDefined();
  });

  it('refuses a caller who does not teach the course (no delete)', async () => {
    courseLinkDoc = {
      classlinkClassId: 'CL-SECTION-1',
      teacherUid: 'teacher-1',
    };
    vi.spyOn(classroomAddonNet, 'listTeacherCourseIds').mockResolvedValue({
      ok: true,
      status: 200,
      // The caller teaches OTHER courses, but NOT the one they're unlinking.
      courseIds: ['SOME-OTHER-COURSE'],
    });

    await expect(
      callUnlink({ data: unlinkData, auth: { uid: 'not-a-teacher' } })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    // The squatting-fix invariant holds for unlink too: a non-teacher of the
    // course can never delete the link.
    expect(findLinkDelete()).toBeUndefined();
  });

  it('fails closed when the teacher course-list check errors (never unlinks on an unverifiable token)', async () => {
    courseLinkDoc = { teacherUid: 'teacher-1' };
    vi.spyOn(classroomAddonNet, 'listTeacherCourseIds').mockResolvedValue({
      ok: false,
      status: 401,
      courseIds: [],
    });

    await expect(
      callUnlink({ data: unlinkData, auth: { uid: 'teacher-1' } })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(findLinkDelete()).toBeUndefined();
  });

  it('rejects an unauthenticated caller before any Classroom call', async () => {
    const listSpy = vi.spyOn(classroomAddonNet, 'listTeacherCourseIds');

    await expect(
      callUnlink({ data: unlinkData, auth: null })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(listSpy).not.toHaveBeenCalled();
    expect(findLinkDelete()).toBeUndefined();
  });

  it('is idempotent: unlinking a course with no existing link is a no-op (removed:false)', async () => {
    courseLinkDoc = null; // not linked
    vi.spyOn(classroomAddonNet, 'listTeacherCourseIds').mockResolvedValue({
      ok: true,
      status: 200,
      courseIds: ['C1'],
    });

    const res = await callUnlink({
      data: unlinkData,
      auth: { uid: 'teacher-1' },
    });

    // A missing link is not an error — a double-click or stale UI shouldn't fail.
    expect(res).toMatchObject({ ok: true, removed: false });
    expect(findLinkDelete()).toBeUndefined();
  });

  it('requires accessToken and courseId', async () => {
    const listSpy = vi.spyOn(classroomAddonNet, 'listTeacherCourseIds');

    await expect(
      callUnlink({
        data: { ...unlinkData, accessToken: '' },
        auth: { uid: 'teacher-1' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      callUnlink({
        data: { ...unlinkData, courseId: '' },
        auth: { uid: 'teacher-1' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    // Malformed input is rejected before any teacher-verification call.
    expect(listSpy).not.toHaveBeenCalled();
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

// The grade PATCH seam used by the batch passback. The batch tests stub this
// seam, so this standalone test pins the real URL/updateMask/body it builds
// against a stubbed fetch (mirrors the addOnContext URL-construction test).
describe('classroomAddonNet.patchStudentSubmissionGrade URL construction', () => {
  it('issues the correct PATCH URL, updateMask, and body (real seam)', async () => {
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
});

// The teacher course-list seam — the trust anchor for linkClassroomCourse. The
// linkClassroomCourse tests stub it, so these pin the real URL/pagination it
// builds and that it degrades safely on a weird upstream body (the parse guard).
describe('classroomAddonNet.listTeacherCourseIds (real seam)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs courses?teacherId=me&courseStates=ACTIVE and paginates, collecting ids', async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: unknown) => {
      const u = url as string;
      urls.push(u);
      // The second page (token present) is the last — no nextPageToken.
      if (u.includes('pageToken=PAGE2')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ courses: [{ id: 'C3' }] }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          courses: [{ id: 'C1' }, { id: 'C2' }],
          nextPageToken: 'PAGE2',
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await classroomAddonNet.listTeacherCourseIds('tok');

    expect(res).toEqual({
      ok: true,
      status: 200,
      courseIds: ['C1', 'C2', 'C3'],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urls[0]).toContain('https://classroom.googleapis.com/v1/courses?');
    expect(urls[0]).toContain('teacherId=me');
    expect(urls[0]).toContain('courseStates=ACTIVE');
    expect(urls[1]).toContain('pageToken=PAGE2');
  });

  it('treats a null/non-object 200 body as an empty final page (no crash)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => null,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await classroomAddonNet.listTeacherCourseIds('tok');

    expect(res).toEqual({ ok: true, status: 200, courseIds: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed (ok:false) on a non-2xx response', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await classroomAddonNet.listTeacherCourseIds('tok');

    expect(res).toEqual({ ok: false, status: 401, courseIds: [] });
  });
});

// The courseWork due-date PATCH seam used to sync the add-on picker's date onto
// the parent assignment. The createClassroomAttachment tests stub this seam, so
// this standalone test pins the real URL/updateMask/body it builds against a
// stubbed fetch (mirrors the addOnContext / studentSubmissions URL tests).
// pushClassroomGradesForAssignment — BATCH grade passback. The teacher's quiz
// monitor calls this once to publish DRAFT grades for every student on one
// Classroom-linked assignment. Security hardening: the caller MUST be the
// linking teacher (request.auth.uid === course-link.teacherUid). Per-student
// submissionIds are resolved from the persisted grade-sync keys
// (classroom_grade_links/{pseudonymUid}/submissions, filtered by attachmentId).
// One upstream PATCH failure (or a student who never opened the attachment)
// must never abort the rest of the batch.
const callPushBatch = pushClassroomGradesForAssignment as unknown as (req: {
  data: unknown;
  auth?: { uid: string } | null;
}) => Promise<{
  results: Array<{
    pseudonymUid: string;
    ok: boolean;
    status?: number;
    reason?: string;
  }>;
  pushed: number;
  skipped: number;
  failed: number;
}>;

const batchData = {
  courseId: 'C1',
  itemId: 'I1',
  attachmentId: 'ATT1',
  // The teacher's fresh add-on token, minted by the monitor's GIS popup and
  // PATCHed with directly. (Replaces the old server-side offline-token mint.)
  accessToken: 'teacher-token',
  grades: [
    { pseudonymUid: 'pseudo-A', pointsEarned: 8 },
    { pseudonymUid: 'pseudo-B', pointsEarned: 5 },
  ],
};

/**
 * Seed a submission doc into the subcollection the batch queries. Mirrors what
 * the student handshake persists: { courseId, itemId, attachmentId,
 * submissionId, teacherUid } — ids only, no PII.
 */
function seedSubmission(
  pseudonymUid: string,
  doc: {
    courseId: string;
    itemId: string;
    attachmentId: string;
    submissionId: string;
    teacherUid?: string;
  }
) {
  const path = `classroom_grade_links/${pseudonymUid}/submissions`;
  const list = submissionsByPath.get(path) ?? [];
  list.push(doc);
  submissionsByPath.set(path, list);
}

describe('pushClassroomGradesForAssignment (batch)', () => {
  it('PATCHes every matched submission with the caller-supplied add-on token', async () => {
    courseLinkDoc = {
      classlinkClassId: 'CL-SECTION-1',
      classlinkOrgId: 'orono',
      teacherUid: 'teacher-123',
    };
    seedSubmission('pseudo-A', {
      courseId: 'C1',
      itemId: 'I1',
      attachmentId: 'ATT1',
      submissionId: 'SUB-A',
    });
    seedSubmission('pseudo-B', {
      courseId: 'C1',
      itemId: 'I1',
      attachmentId: 'ATT1',
      submissionId: 'SUB-B',
    });
    const patchSpy = vi
      .spyOn(classroomAddonNet, 'patchStudentSubmissionGrade')
      .mockResolvedValue({ ok: true, status: 200 });

    const res = await callPushBatch({
      data: batchData,
      auth: { uid: 'teacher-123' },
    });

    expect(res.pushed).toBe(2);
    expect(res.skipped).toBe(0);
    expect(res.results).toHaveLength(2);
    expect(res.results.every((r) => r.ok)).toBe(true);
    // Each PATCH carries the SUPPLIED token + resolved submissionId + score.
    expect(patchSpy).toHaveBeenCalledTimes(2);
    expect(patchSpy).toHaveBeenCalledWith(
      'teacher-token',
      'C1',
      'I1',
      'ATT1',
      'SUB-A',
      8
    );
    expect(patchSpy).toHaveBeenCalledWith(
      'teacher-token',
      'C1',
      'I1',
      'ATT1',
      'SUB-B',
      5
    );
  });

  it('rounds fractional scores before PATCHing', async () => {
    courseLinkDoc = { teacherUid: 'teacher-123' };
    seedSubmission('pseudo-A', {
      courseId: 'C1',
      itemId: 'I1',
      attachmentId: 'ATT1',
      submissionId: 'SUB-A',
    });
    const patchSpy = vi
      .spyOn(classroomAddonNet, 'patchStudentSubmissionGrade')
      .mockResolvedValue({ ok: true, status: 200 });

    const res = await callPushBatch({
      data: {
        ...batchData,
        grades: [{ pseudonymUid: 'pseudo-A', pointsEarned: 7.6 }],
      },
      auth: { uid: 'teacher-123' },
    });

    expect(res.pushed).toBe(1);
    expect(patchSpy).toHaveBeenCalledWith(
      'teacher-token',
      'C1',
      'I1',
      'ATT1',
      'SUB-A',
      8
    );
  });

  it('refuses a caller whose uid is not the linking teacher (no PATCH)', async () => {
    courseLinkDoc = { teacherUid: 'teacher-123' };
    const patchSpy = vi.spyOn(classroomAddonNet, 'patchStudentSubmissionGrade');

    await expect(
      callPushBatch({ data: batchData, auth: { uid: 'someone-else' } })
    ).rejects.toMatchObject({ code: 'permission-denied' });

    // The security invariant: an impostor PATCHes NOTHING (even with a token).
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller (no request.auth)', async () => {
    courseLinkDoc = { teacherUid: 'teacher-123' };
    const patchSpy = vi.spyOn(classroomAddonNet, 'patchStudentSubmissionGrade');

    await expect(
      callPushBatch({ data: batchData, auth: null })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('refuses when no course link exists (cannot establish the owning teacher)', async () => {
    courseLinkDoc = null; // course not linked
    const patchSpy = vi.spyOn(classroomAddonNet, 'patchStudentSubmissionGrade');

    await expect(
      callPushBatch({ data: batchData, auth: { uid: 'teacher-123' } })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('skips a student with no matching submission and still pushes the others', async () => {
    courseLinkDoc = { teacherUid: 'teacher-123' };
    // Only pseudo-A has a submission; pseudo-B never opened the attachment.
    seedSubmission('pseudo-A', {
      courseId: 'C1',
      itemId: 'I1',
      attachmentId: 'ATT1',
      submissionId: 'SUB-A',
    });
    const patchSpy = vi
      .spyOn(classroomAddonNet, 'patchStudentSubmissionGrade')
      .mockResolvedValue({ ok: true, status: 200 });

    const res = await callPushBatch({
      data: batchData,
      auth: { uid: 'teacher-123' },
    });

    expect(res.pushed).toBe(1);
    expect(res.skipped).toBe(1);
    const a = res.results.find((r) => r.pseudonymUid === 'pseudo-A');
    const b = res.results.find((r) => r.pseudonymUid === 'pseudo-B');
    expect(a?.ok).toBe(true);
    expect(b?.ok).toBe(false);
    expect(b?.reason).toBeTruthy();
    // Only the matched student is PATCHed.
    expect(patchSpy).toHaveBeenCalledTimes(1);
    expect(patchSpy).toHaveBeenCalledWith(
      'teacher-token',
      'C1',
      'I1',
      'ATT1',
      'SUB-A',
      8
    );
  });

  it('does NOT match a submission for a different attachment (filtered by attachmentId)', async () => {
    courseLinkDoc = { teacherUid: 'teacher-123' };
    // pseudo-A has a submission, but for a DIFFERENT attachment → no match.
    seedSubmission('pseudo-A', {
      courseId: 'C1',
      itemId: 'I1',
      attachmentId: 'OTHER-ATT',
      submissionId: 'SUB-OTHER',
    });
    const patchSpy = vi.spyOn(classroomAddonNet, 'patchStudentSubmissionGrade');

    const res = await callPushBatch({
      data: {
        ...batchData,
        grades: [{ pseudonymUid: 'pseudo-A', pointsEarned: 8 }],
      },
      auth: { uid: 'teacher-123' },
    });

    expect(res.pushed).toBe(0);
    expect(res.skipped).toBe(1);
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('records ok:false for an upstream PATCH failure without aborting the batch', async () => {
    courseLinkDoc = { teacherUid: 'teacher-123' };
    seedSubmission('pseudo-A', {
      courseId: 'C1',
      itemId: 'I1',
      attachmentId: 'ATT1',
      submissionId: 'SUB-A',
    });
    seedSubmission('pseudo-B', {
      courseId: 'C1',
      itemId: 'I1',
      attachmentId: 'ATT1',
      submissionId: 'SUB-B',
    });
    // SUB-A fails upstream (403), SUB-B succeeds.
    vi.spyOn(
      classroomAddonNet,
      'patchStudentSubmissionGrade'
    ).mockImplementation(
      async (
        _token: string,
        _courseId: string,
        _itemId: string,
        _attachmentId: string,
        submissionId: string
      ) =>
        submissionId === 'SUB-A'
          ? { ok: false, status: 403 }
          : { ok: true, status: 200 }
    );

    const res = await callPushBatch({
      data: batchData,
      auth: { uid: 'teacher-123' },
    });

    // The batch does NOT throw; the failure is captured per-entry. An upstream
    // PATCH error is a real FAILURE (retryable), NOT a benign "not opened" skip.
    expect(res.pushed).toBe(1);
    expect(res.skipped).toBe(0);
    expect(res.failed).toBe(1);
    const a = res.results.find((r) => r.pseudonymUid === 'pseudo-A');
    const b = res.results.find((r) => r.pseudonymUid === 'pseudo-B');
    expect(a?.ok).toBe(false);
    expect(a?.status).toBe(403);
    expect(b?.ok).toBe(true);
  });

  it('clamps pointsEarned to a supplied maxPoints (defense-in-depth)', async () => {
    courseLinkDoc = { teacherUid: 'teacher-123' };
    seedSubmission('pseudo-A', {
      courseId: 'C1',
      itemId: 'I1',
      attachmentId: 'ATT1',
      submissionId: 'SUB-A',
    });
    const patchSpy = vi
      .spyOn(classroomAddonNet, 'patchStudentSubmissionGrade')
      .mockResolvedValue({ ok: true, status: 200 });

    const res = await callPushBatch({
      data: {
        ...batchData,
        maxPoints: 20,
        // A buggy client over-reports 999 against a 20-point scale.
        grades: [{ pseudonymUid: 'pseudo-A', pointsEarned: 999 }],
      },
      auth: { uid: 'teacher-123' },
    });

    expect(res.pushed).toBe(1);
    // PATCHed value is clamped to the scale, never the raw 999.
    expect(patchSpy).toHaveBeenCalledWith(
      'teacher-token',
      'C1',
      'I1',
      'ATT1',
      'SUB-A',
      20
    );
  });

  it('rejects (invalid-argument) when accessToken is missing, before any PATCH', async () => {
    courseLinkDoc = { teacherUid: 'teacher-123' };
    seedSubmission('pseudo-A', {
      courseId: 'C1',
      itemId: 'I1',
      attachmentId: 'ATT1',
      submissionId: 'SUB-A',
    });
    const patchSpy = vi.spyOn(classroomAddonNet, 'patchStudentSubmissionGrade');

    await expect(
      callPushBatch({
        data: { ...batchData, accessToken: '' },
        auth: { uid: 'teacher-123' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('validates the input shape before any auth/network work', async () => {
    const patchSpy = vi.spyOn(classroomAddonNet, 'patchStudentSubmissionGrade');

    // Missing ids.
    await expect(
      callPushBatch({
        data: { ...batchData, courseId: '' },
        auth: { uid: 'teacher-123' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      callPushBatch({
        data: { ...batchData, attachmentId: '' },
        auth: { uid: 'teacher-123' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    // Missing access token.
    await expect(
      callPushBatch({
        data: { ...batchData, accessToken: '' },
        auth: { uid: 'teacher-123' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    // Empty grades array.
    await expect(
      callPushBatch({
        data: { ...batchData, grades: [] },
        auth: { uid: 'teacher-123' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    // grades not an array.
    await expect(
      callPushBatch({
        data: { ...batchData, grades: 'nope' },
        auth: { uid: 'teacher-123' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('records malformed grade entries (bad pseudonymUid / negative score) as failed (not skipped) but pushes valid ones', async () => {
    courseLinkDoc = { teacherUid: 'teacher-123' };
    seedSubmission('pseudo-A', {
      courseId: 'C1',
      itemId: 'I1',
      attachmentId: 'ATT1',
      submissionId: 'SUB-A',
    });
    const patchSpy = vi
      .spyOn(classroomAddonNet, 'patchStudentSubmissionGrade')
      .mockResolvedValue({ ok: true, status: 200 });

    const res = await callPushBatch({
      data: {
        ...batchData,
        grades: [
          { pseudonymUid: 'pseudo-A', pointsEarned: 8 },
          { pseudonymUid: '', pointsEarned: 5 },
          { pseudonymUid: 'pseudo-C', pointsEarned: -3 },
        ],
      },
      auth: { uid: 'teacher-123' },
    });

    expect(res.pushed).toBe(1);
    // Malformed entries are real FAILURES (retryable / a client bug), not the
    // benign "not opened yet" skip bucket.
    expect(res.skipped).toBe(0);
    expect(res.failed).toBe(2);
    expect(patchSpy).toHaveBeenCalledTimes(1);
    expect(patchSpy).toHaveBeenCalledWith(
      'teacher-token',
      'C1',
      'I1',
      'ATT1',
      'SUB-A',
      8
    );
  });
});
