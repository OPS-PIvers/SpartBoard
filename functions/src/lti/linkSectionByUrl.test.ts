/* eslint-disable @typescript-eslint/require-await -- mock async handlers mirror
   the async Admin-SDK / network surface without awaiting anything. */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'HttpsError';
    }
  }
  return { onCall: (_o: unknown, handler: unknown) => handler, HttpsError };
});

vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({
    value: () =>
      name === 'CLASSLINK_TENANT_URL'
        ? 'https://tenant.example'
        : `secret:${name}`,
  }),
}));

let rosters: { id: string; data: Record<string, unknown> }[] = [];
const courseLinks = new Map<string, Record<string, unknown>>();

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(() => ({
    collection: (name: string) => {
      if (name === 'lti_course_links') {
        return {
          doc: (ctx: string) => ({
            _ctx: ctx,
            get: async () => ({
              exists: courseLinks.has(ctx),
              data: () => courseLinks.get(ctx),
            }),
          }),
        };
      }
      if (name === 'users') {
        return {
          doc: () => ({
            collection: () => ({
              get: async () => ({
                docs: rosters.map((r) => ({ id: r.id, data: () => r.data })),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
    runTransaction: async (
      fn: (tx: {
        get: (ref: { _ctx: string }) => Promise<{
          exists: boolean;
          data: () => unknown;
        }>;
        set: (ref: { _ctx: string }, data: Record<string, unknown>) => void;
      }) => Promise<unknown>
    ) =>
      fn({
        get: async (ref) => ({
          exists: courseLinks.has(ref._ctx),
          data: () => courseLinks.get(ref._ctx),
        }),
        set: (ref, data) =>
          courseLinks.set(ref._ctx, {
            ...(courseLinks.get(ref._ctx) ?? {}),
            ...data,
          }),
      }),
  })),
}));

vi.mock('./config', async (orig) => ({
  ...(await orig<typeof import('./config')>()),
  getLtiPlatformConfig: vi
    .fn()
    .mockResolvedValue({ clientId: 'client-1', tokenUrl: 'https://lms/token' }),
}));

vi.mock('./ags', () => ({
  getAgsAccessToken: vi.fn().mockResolvedValue('nrps-token'),
}));

const { fetchNrpsMembershipMock, fetchClassStudentsMock, grantedMock } =
  vi.hoisted(() => ({
    fetchNrpsMembershipMock: vi.fn(),
    fetchClassStudentsMock: vi.fn(),
    grantedMock: vi.fn(),
  }));
vi.mock('./nrps', () => ({ fetchNrpsMembership: fetchNrpsMembershipMock }));
vi.mock('../classroomAddonAuth', () => ({
  classroomAddonNet: { fetchClassStudents: fetchClassStudentsMock },
}));
vi.mock('../quizMediaArchive', () => ({
  isGlobalFeatureGranted: grantedMock,
}));

import {
  activeLearnerEmails,
  isActiveInstructor,
  ltiLinkSectionByUrlV1,
  parseSchoologyCourseUrl,
} from './linkSectionByUrl';

type Req = {
  auth?: { uid: string; token: Record<string, unknown> };
  data: unknown;
};
const call = ltiLinkSectionByUrlV1 as unknown as (
  r: Req
) => Promise<Record<string, unknown>>;

const INSTRUCTOR =
  'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor';
const LEARNER = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner';
const URL_OK = 'https://orono.schoology.com/course/7660186912/materials';
const TEACHER = { uid: 'teacher-1', token: { email: 'T@school.edu' } };

const member = (
  email: string,
  role: string,
  status = 'Active'
): Record<string, unknown> => ({
  userId: `${email}-sub`,
  givenName: '',
  familyName: '',
  email,
  roles: [role],
  status,
});

beforeEach(() => {
  rosters = [
    { id: 'r-1', data: { classlinkClassId: 'cl-1', classlinkOrgId: 'org' } },
    { id: 'r-2', data: { classlinkClassId: 'cl-2' } },
    { id: 'r-test', data: { testClassId: 'mock-p1' } },
  ];
  courseLinks.clear();
  grantedMock.mockReset().mockResolvedValue(true);
  fetchNrpsMembershipMock.mockReset().mockResolvedValue({
    contextTitle: 'Biology · P2',
    members: [
      member('t@school.edu', INSTRUCTOR),
      member('a@school.edu', LEARNER),
      member('b@school.edu', LEARNER),
    ],
  });
  fetchClassStudentsMock
    .mockReset()
    .mockImplementation(
      async (_t: string, _i: string, _s: string, classId: string) =>
        classId === 'cl-1'
          ? [{ email: 'A@school.edu' }, { email: 'b@school.edu' }]
          : [{ email: 'b@school.edu' }, { email: 'z@school.edu' }]
    );
});

describe('parseSchoologyCourseUrl', () => {
  it.each([
    [URL_OK, '7660186912'],
    ['orono.schoology.com/course/7660186912', '7660186912'],
    ['https://app.schoology.com/course/123/updates?x=1', '123'],
    ['  https://schoology.com/course/9/  ', '9'],
  ])('%s → %s', (url, id) => {
    expect(parseSchoologyCourseUrl(url)).toBe(id);
  });

  it.each([
    'https://evil.test/course/123',
    'https://schoology.com.evil.test/course/123',
    'http://orono.schoology.com/course/123',
    'https://orono.schoology.com:8080/course/123',
    'https://orono.schoology.com/course/12a3',
    'https://orono.schoology.com/group/123',
    'https://orono.schoology.com/course/../course/123x',
    'javascript:alert(1)',
    '',
  ])('rejects %s', (url) => {
    expect(parseSchoologyCourseUrl(url)).toBeNull();
  });
});

describe('roster helpers', () => {
  it('ignores an inactive instructor and inactive learners', () => {
    const members = [
      member('t@school.edu', INSTRUCTOR, 'Inactive'),
      member('a@school.edu', LEARNER, 'Inactive'),
      member('b@school.edu', LEARNER),
    ] as never;
    expect(isActiveInstructor(members, 'T@school.edu')).toBe(false);
    expect([...activeLearnerEmails(members)]).toEqual(['b@school.edu']);
  });

  it('does not treat a learner with the caller email as a teacher', () => {
    const members = [member('t@school.edu', LEARNER)] as never;
    expect(isActiveInstructor(members, 't@school.edu')).toBe(false);
  });
});

describe('ltiLinkSectionByUrlV1', () => {
  it('rejects signed-out and student callers', async () => {
    await expect(call({ data: { url: URL_OK } })).rejects.toThrow(/Sign in/);
    await expect(
      call({
        auth: { uid: 's', token: { studentRole: true } },
        data: { url: URL_OK },
      })
    ).rejects.toThrow(/Teacher account/);
  });

  it('rejects a link that is not a Schoology course', async () => {
    await expect(
      call({ auth: TEACHER, data: { url: 'https://evil.test/course/1' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(fetchNrpsMembershipMock).not.toHaveBeenCalled();
  });

  it('rejects a caller without the feature', async () => {
    grantedMock.mockResolvedValue(false);
    await expect(
      call({ auth: TEACHER, data: { url: URL_OK } })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(fetchNrpsMembershipMock).not.toHaveBeenCalled();
  });

  it('reads NRPS from the URL built from the section id', async () => {
    await call({ auth: TEACHER, data: { url: URL_OK } });
    expect(fetchNrpsMembershipMock.mock.calls[0][0]).toBe(
      'https://lti-service.svc.schoology.com/lti-service/tool/8409082949/services/names-roles/v2p0/membership/7660186912'
    );
  });

  it('requires the caller to be an instructor of the section', async () => {
    fetchNrpsMembershipMock.mockResolvedValue({
      contextTitle: null,
      members: [member('a@school.edu', LEARNER)],
    });
    await expect(
      call({ auth: TEACHER, data: { url: URL_OK } })
    ).rejects.toThrow(/isn’t listed as a teacher/);
  });

  it('ranks the caller’s classes by overlap, without emails', async () => {
    const res = await call({ auth: TEACHER, data: { url: URL_OK } });
    expect(res).toEqual({
      contextId: '7660186912',
      contextTitle: 'Biology · P2',
      learnerCount: 2,
      suggestions: [
        { rosterId: 'r-1', overlap: 2 },
        { rosterId: 'r-2', overlap: 1 },
      ],
      linkedRosterId: null,
    });
    expect(JSON.stringify(res)).not.toContain('@');
    expect(courseLinks.size).toBe(0);
  });

  it('links the section to an owned roster with overlap', async () => {
    const res = await call({
      auth: TEACHER,
      data: { url: URL_OK, rosterId: 'r-1' },
    });
    expect(res).toMatchObject({ ok: true, contextId: '7660186912' });
    expect(courseLinks.get('7660186912')).toMatchObject({
      teacherUid: 'teacher-1',
      classlinkClassId: 'cl-1',
      classlinkOrgId: 'org',
      rosterId: 'r-1',
      contextTitle: 'Biology · P2',
      linkedBy: 'url',
    });
  });

  it('refuses a class with no overlap', async () => {
    fetchClassStudentsMock.mockResolvedValue([{ email: 'z@school.edu' }]);
    await expect(
      call({ auth: TEACHER, data: { url: URL_OK, rosterId: 'r-2' } })
    ).rejects.toThrow(/None of this Schoology course/);
    expect(courseLinks.size).toBe(0);
  });

  it('refuses a roster the caller does not own (or a test class)', async () => {
    for (const rosterId of ['someone-elses', 'r-test']) {
      await expect(
        call({ auth: TEACHER, data: { url: URL_OK, rosterId } })
      ).rejects.toMatchObject({ code: 'permission-denied' });
    }
  });

  it('never re-points a section another teacher linked', async () => {
    courseLinks.set('7660186912', { teacherUid: 'teacher-2' });
    await expect(
      call({ auth: TEACHER, data: { url: URL_OK, rosterId: 'r-1' } })
    ).rejects.toMatchObject({ code: 'already-exists' });
    expect(courseLinks.get('7660186912')).toEqual({ teacherUid: 'teacher-2' });
  });

  it('lets the same teacher re-link and keeps an earlier title', async () => {
    courseLinks.set('7660186912', {
      teacherUid: 'teacher-1',
      rosterId: 'r-2',
      contextTitle: 'Old title',
    });
    fetchNrpsMembershipMock.mockResolvedValue({
      contextTitle: null,
      members: [
        member('t@school.edu', INSTRUCTOR),
        member('a@school.edu', LEARNER),
      ],
    });
    const preview = await call({ auth: TEACHER, data: { url: URL_OK } });
    expect(preview.linkedRosterId).toBe('r-2');
    await call({ auth: TEACHER, data: { url: URL_OK, rosterId: 'r-1' } });
    expect(courseLinks.get('7660186912')).toMatchObject({
      rosterId: 'r-1',
      contextTitle: 'Old title',
    });
  });

  it('reports an unreadable course plainly', async () => {
    fetchNrpsMembershipMock.mockRejectedValue(new Error('404'));
    await expect(
      call({ auth: TEACHER, data: { url: URL_OK } })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
