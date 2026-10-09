/* eslint-disable @typescript-eslint/require-await -- the Firestore fake mirrors
   the async Admin-SDK surface without awaiting anything. */
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

const secrets: Record<string, string> = {};
vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ value: () => secrets[name] ?? '' }),
}));

// ── Path-keyed Firestore fake ───────────────────────────────────────────────
const docs = new Map<string, Record<string, unknown>>();

interface FakeDoc {
  id: string;
  path: string;
  get(): Promise<{
    id: string;
    exists: boolean;
    data(): Record<string, unknown> | undefined;
  }>;
  set(data: Record<string, unknown>, opts?: { merge?: boolean }): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  collection(name: string): FakeCollection;
}
interface FakeCollection {
  doc(id: string): FakeDoc;
  get(): Promise<{ docs: unknown[] }>;
  where(
    field: string,
    op: string,
    value: unknown
  ): { get(): Promise<{ docs: unknown[] }> };
}

const snapOf = (path: string) => ({
  id: path.split('/').pop() as string,
  exists: docs.has(path),
  data: () => docs.get(path),
  ref: docRef(path),
});

function docRef(path: string): FakeDoc {
  return {
    id: path.split('/').pop() as string,
    path,
    get: async () => snapOf(path),
    set: async (data, opts) => {
      docs.set(
        path,
        opts?.merge ? { ...(docs.get(path) ?? {}), ...data } : { ...data }
      );
    },
    update: async (data) => {
      const cur = docs.get(path);
      if (!cur) throw new Error('5 NOT_FOUND');
      docs.set(path, { ...cur, ...data });
    },
    delete: async () => {
      docs.delete(path);
    },
    collection: (name) => collectionRef(`${path}/${name}`),
  };
}

function collectionRef(path: string): FakeCollection {
  const children = () =>
    [...docs.keys()].filter(
      (k) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/')
    );
  return {
    doc: (id) => docRef(`${path}/${id}`),
    get: async () => ({ docs: children().map(snapOf) }),
    where: (field, _op, value) => ({
      get: async () => ({
        docs: children()
          .filter((k) => docs.get(k)?.[field] === value)
          .map(snapOf),
      }),
    }),
  };
}

const fakeDb = {
  collection: collectionRef,
  doc: docRef,
  getAll: async (...refs: FakeDoc[]) => refs.map((r) => snapOf(r.path)),
  runTransaction: async <T>(
    fn: (tx: {
      get: (r: FakeDoc) => Promise<unknown>;
      set: (
        r: FakeDoc,
        d: Record<string, unknown>,
        o?: { merge?: boolean }
      ) => void;
    }) => Promise<T>
  ) =>
    fn({
      get: async (r) => snapOf(r.path),
      set: (r, d, o) => void r.set(d, o),
    }),
};

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(() => fakeDb),
}));

vi.mock('./config', async (orig) => ({
  ...(await orig<typeof import('./config')>()),
  getLtiPlatformConfig: vi
    .fn()
    .mockResolvedValue({ clientId: 'client-1', tokenUrl: 'https://lms/token' }),
}));

const { grantedMock, pushSectionMock, restMock, deleteLineItemMock, nrpsMock } =
  vi.hoisted(() => ({
    grantedMock: vi.fn(),
    pushSectionMock: vi.fn(),
    deleteLineItemMock: vi.fn(),
    nrpsMock: vi.fn(),
    restMock: {
      listGradingCategories: vi.fn(),
      createGradingCategories: vi.fn(),
      getColumnCategory: vi.fn(),
    },
  }));
vi.mock('../quizMediaArchive', () => ({ isGlobalFeatureGranted: grantedMock }));
vi.mock('./ags', () => ({
  getAgsAccessToken: vi.fn().mockResolvedValue('tok'),
  postScore: vi.fn(),
}));
vi.mock('./nrps', () => ({ fetchNrpsMembers: nrpsMock }));
vi.mock('./toolColumns', async (orig) => ({
  ...(await orig<typeof import('./toolColumns')>()),
  pushSection: pushSectionMock,
}));
vi.mock('./lineItems', async (orig) => ({
  ...(await orig<typeof import('./lineItems')>()),
  deleteLineItem: deleteLineItemMock,
}));
vi.mock('../schoology/restClient', async (orig) => ({
  ...(await orig<typeof import('../schoology/restClient')>()),
  ...restMock,
}));

import {
  ltiCreateToolColumnCategoriesV1,
  ltiDeleteToolColumnsV1,
  ltiPushToolColumnV1,
  ltiToolColumnCategoriesV1,
} from './toolColumnEndpoints';
import { schoologySectionUrls } from './lineItems';

type Req = {
  auth?: { uid: string; token: Record<string, unknown> };
  data: unknown;
};
type Fn = (r: Req) => Promise<Record<string, unknown>>;
const push = ltiPushToolColumnV1 as unknown as Fn;
const categories = ltiToolColumnCategoriesV1 as unknown as Fn;
const createCategories = ltiCreateToolColumnCategoriesV1 as unknown as Fn;
const del = ltiDeleteToolColumnsV1 as unknown as Fn;

const T = { uid: 'teacher-1', token: { email: 't@school.edu' } };
const INSTRUCTOR_MEMBER = {
  userId: '7::x',
  givenName: '',
  familyName: '',
  email: 't@school.edu',
  roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
  status: 'Active',
};
// Only section 111's roster lists the caller as a teacher.
const teachesOnly111 = async (url: string) =>
  url === schoologySectionUrls('111').membershipUrl ? [INSTRUCTOR_MEMBER] : [];
const ITEM = `${schoologySectionUrls('111').lineitemsUrl}/555`;

beforeEach(() => {
  docs.clear();
  Object.assign(secrets, {
    LTI_TOOL_PRIVATE_KEY: 'pem',
    STUDENT_PSEUDONYM_HMAC_SECRET: 'hmac',
    SCHOOLOGY_API_CONSUMER_KEY: 'key',
    SCHOOLOGY_API_CONSUMER_SECRET: 'secret',
  });
  grantedMock.mockReset().mockResolvedValue(true);
  pushSectionMock.mockReset().mockImplementation(
    async (
      _deps,
      input: {
        section: { contextId: string; title: string };
        grades: { pseudonymUid: string }[];
      }
    ) => ({
      contextId: input.section.contextId,
      title: input.section.title,
      status: 'pushed',
      columnCreated: true,
      needsCategory: false,
      results: input.grades.map((g) => ({
        pseudonymUid: g.pseudonymUid,
        ok: true,
      })),
    })
  );
  restMock.listGradingCategories
    .mockReset()
    .mockResolvedValue([{ id: '7', title: 'Academic Practice', weight: 20 }]);
  restMock.createGradingCategories.mockReset();
  restMock.getColumnCategory.mockReset().mockResolvedValue('7');
  deleteLineItemMock.mockReset().mockResolvedValue('deleted');
  nrpsMock.mockReset().mockResolvedValue([INSTRUCTOR_MEMBER]);

  docs.set('quiz_sessions/S1', {
    teacherUid: 'teacher-1',
    quizTitle: 'Cells quiz',
    classIds: ['cl-1'],
    rosterIds: ['r-2'],
  });
  // Targeted by class id, by roster id, untargeted, another teacher's, and a non-Schoology id.
  docs.set('lti_course_links/111', {
    teacherUid: 'teacher-1',
    classlinkClassId: 'cl-1',
    contextTitle: 'Bio P1',
  });
  docs.set('lti_course_links/222', {
    teacherUid: 'teacher-1',
    classlinkClassId: 'cl-2',
    rosterId: 'r-2',
  });
  docs.set('lti_course_links/333', {
    teacherUid: 'teacher-1',
    classlinkClassId: 'cl-3',
  });
  docs.set('lti_course_links/444', {
    teacherUid: 'teacher-2',
    classlinkClassId: 'cl-1',
  });
  docs.set('lti_course_links/ctx-old', {
    teacherUid: 'teacher-1',
    classlinkClassId: 'cl-1',
  });
});

const pushData = {
  sessionId: 'S1',
  kind: 'quiz',
  maxPoints: 10,
  grades: [
    { pseudonymUid: 'u1', pointsEarned: 8 },
    { pseudonymUid: 'u2', missing: true, pointsEarned: 3 },
  ],
  create: true,
  categories: { '111': '7', '222': 'not-an-id' },
};

describe('ltiPushToolColumnV1', () => {
  it('rejects signed-out, student and flag-off callers', async () => {
    await expect(push({ data: pushData })).rejects.toThrow(/Sign in/);
    await expect(
      push({ auth: { uid: 's', token: { studentRole: true } }, data: pushData })
    ).rejects.toThrow(/Teacher account/);
    grantedMock.mockResolvedValue(false);
    await expect(push({ auth: T, data: pushData })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(pushSectionMock).not.toHaveBeenCalled();
  });

  it('rejects a session the caller does not own', async () => {
    docs.set('quiz_sessions/S1', { teacherUid: 'teacher-2' });
    await expect(push({ auth: T, data: pushData })).rejects.toThrow(
      /Not the teacher/
    );
  });

  it('asks for a link when no section is targeted', async () => {
    docs.set('quiz_sessions/S1', {
      teacherUid: 'teacher-1',
      classIds: ['nope'],
    });
    await expect(push({ auth: T, data: pushData })).rejects.toThrow(
      /Link this class to Schoology first/
    );
  });

  it('pushes only to the caller’s targeted Schoology sections', async () => {
    const res = await push({ auth: T, data: pushData });
    const calls = pushSectionMock.mock.calls.map(
      (c) => c[1] as Record<string, unknown>
    );
    expect(
      calls.map((c) => (c.section as { contextId: string }).contextId)
    ).toEqual(['111', '222']);
    expect(calls[0]).toMatchObject({
      resourceId: 'spartboard:quiz:S1',
      label: 'Cells quiz',
      maxPoints: 10,
      create: true,
      categoryId: '7',
      grades: [
        { pseudonymUid: 'u1', pointsEarned: 8 },
        { pseudonymUid: 'u2', missing: true },
      ],
    });
    expect(calls[1].categoryId).toBeNull();
    expect(res).toMatchObject({ pushed: 2, total: 2 });
    expect(docs.get('quiz_sessions/S1')?.ltiToolColumn).toBe(true);
  });

  it('reports a failing section without failing the others', async () => {
    pushSectionMock.mockRejectedValueOnce(new Error('ags down'));
    const res = await push({ auth: T, data: pushData });
    expect((res.sections as { status: string }[]).map((s) => s.status)).toEqual(
      ['failed', 'pushed']
    );
  });

  it('refuses sections the caller no longer teaches, sharing one NRPS read', async () => {
    nrpsMock.mockImplementation(teachesOnly111);
    pushSectionMock.mockImplementationOnce(
      async (
        deps: { nrpsMembers: (u: string, t: string) => Promise<unknown> },
        input: { section: { contextId: string; title: string } }
      ) => {
        await deps.nrpsMembers(
          schoologySectionUrls('111').membershipUrl,
          'tok'
        );
        return {
          contextId: input.section.contextId,
          title: input.section.title,
          status: 'pushed',
          columnCreated: true,
          needsCategory: false,
          results: [
            { pseudonymUid: 'u1', ok: true },
            { pseudonymUid: 'u2', ok: true },
          ],
        };
      }
    );
    const res = await push({ auth: T, data: pushData });
    expect(pushSectionMock).toHaveBeenCalledTimes(1);
    expect((res.sections as { status: string }[]).map((s) => s.status)).toEqual(
      ['pushed', 'failed']
    );
    expect(nrpsMock).toHaveBeenCalledTimes(2);
  });

  it('does not recreate a session deleted during the push', async () => {
    pushSectionMock.mockImplementation(
      async (_deps, input: { section: { contextId: string } }) => {
        docs.delete('quiz_sessions/S1');
        return {
          contextId: input.section.contextId,
          title: null,
          status: 'pushed',
          columnCreated: true,
          needsCategory: false,
          results: [],
        };
      }
    );
    await push({ auth: T, data: pushData });
    expect(docs.has('quiz_sessions/S1')).toBe(false);
  });

  it('validates the request', async () => {
    for (const data of [
      { ...pushData, maxPoints: 0 },
      { ...pushData, grades: [] },
      { ...pushData, kind: 'bogus' },
    ]) {
      await expect(push({ auth: T, data })).rejects.toMatchObject({
        code: 'invalid-argument',
      });
    }
  });
});

describe('ltiToolColumnCategoriesV1', () => {
  it('returns categories, column state and the remembered pick', async () => {
    docs.set('lti_tool_columns/S1/sections/111', {
      lineitemUrl: ITEM,
      columnId: '555',
      status: 'ready',
    });
    docs.set('lti_tool_columns_prefs/teacher-1_222', { categoryId: '7' });
    restMock.getColumnCategory.mockResolvedValue('0');
    const res = await categories({
      auth: T,
      data: { sessionId: 'S1', kind: 'quiz' },
    });
    expect(res.sections).toEqual([
      {
        contextId: '111',
        title: 'Bio P1',
        hasColumn: true,
        needsCategory: true,
        categories: [{ id: '7', title: 'Academic Practice', weight: 20 }],
        defaultCategoryId: null,
      },
      {
        contextId: '222',
        title: null,
        hasColumn: false,
        needsCategory: true,
        categories: [{ id: '7', title: 'Academic Practice', weight: 20 }],
        defaultCategoryId: '7',
      },
    ]);
    expect(res.recommended).toEqual([
      { title: 'Academic Practice', weight: 20 },
      { title: 'Academic Achievement', weight: 80 },
    ]);
  });

  it('treats a column deleted in Schoology as no column', async () => {
    docs.set('lti_tool_columns/S1/sections/111', {
      lineitemUrl: ITEM,
      columnId: '555',
      status: 'ready',
    });
    restMock.getColumnCategory.mockResolvedValue(null);
    const res = await categories({ auth: T, data: { sessionId: 'S1' } });
    expect((res.sections as Record<string, unknown>[])[0]).toMatchObject({
      contextId: '111',
      hasColumn: false,
      needsCategory: true,
    });
  });

  it('uses the admin’s recommended categories when set', async () => {
    docs.set('admin_settings/schoology_categories', {
      categories: [{ title: 'Summative', weight: 100 }],
    });
    const res = await categories({ auth: T, data: { sessionId: 'S1' } });
    expect(res.recommended).toEqual([{ title: 'Summative', weight: 100 }]);
  });

  it('returns null categories when the REST key is a placeholder', async () => {
    secrets.SCHOOLOGY_API_CONSUMER_KEY = 'placeholder';
    const res = await categories({ auth: T, data: { sessionId: 'S1' } });
    expect(
      (res.sections as { categories: unknown; needsCategory: boolean }[]).every(
        (s) => s.categories === null && !s.needsCategory
      )
    ).toBe(true);
    expect(restMock.listGradingCategories).not.toHaveBeenCalled();
  });
});

describe('ltiCreateToolColumnCategoriesV1', () => {
  const body = {
    sessionId: 'S1',
    contextId: '222',
    categories: [
      { title: 'Academic Practice', weight: 20 },
      { title: 'Academic Achievement', weight: 80 },
    ],
  };

  it('creates categories in an empty course and flags weighting off', async () => {
    restMock.listGradingCategories.mockResolvedValue([]);
    restMock.createGradingCategories.mockResolvedValue([
      { id: '1', title: 'Academic Practice', weight: 0 },
      { id: '2', title: 'Academic Achievement', weight: 0 },
    ]);
    const res = await createCategories({ auth: T, data: body });
    expect(restMock.createGradingCategories).toHaveBeenCalledWith(
      { consumerKey: 'key', consumerSecret: 'secret' },
      '222',
      body.categories
    );
    expect(res.weightingOff).toBe(true);
  });

  it('refuses a section the caller does not teach', async () => {
    restMock.listGradingCategories.mockResolvedValue([]);
    nrpsMock.mockImplementation(teachesOnly111);
    await expect(
      createCategories({ auth: T, data: body })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(restMock.createGradingCategories).not.toHaveBeenCalled();
  });

  it('refuses a course that already has categories', async () => {
    await expect(createCategories({ auth: T, data: body })).rejects.toThrow(
      /already has grading categories/
    );
    expect(restMock.createGradingCategories).not.toHaveBeenCalled();
  });

  it('refuses a section this assignment does not target', async () => {
    restMock.listGradingCategories.mockResolvedValue([]);
    for (const contextId of ['333', '444']) {
      await expect(
        createCategories({ auth: T, data: { ...body, contextId } })
      ).rejects.toMatchObject({ code: 'permission-denied' });
    }
  });

  it('requires weights that add up to 100', async () => {
    await expect(
      createCategories({
        auth: T,
        data: { ...body, categories: [{ title: 'A', weight: 50 }] },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('ltiDeleteToolColumnsV1', () => {
  beforeEach(() => {
    docs.set('lti_tool_columns/S1', { teacherUid: 'teacher-1' });
    docs.set('lti_tool_columns/S1/sections/111', { lineitemUrl: ITEM });
    docs.set('lti_tool_columns/S1/sections/222', {
      lineitemUrl: 'https://evil.test/x',
    });
  });

  it('deletes the recorded columns even after the session is gone', async () => {
    docs.delete('quiz_sessions/S1');
    const res = await del({ auth: T, data: { sessionId: 'S1' } });
    expect(deleteLineItemMock).toHaveBeenCalledTimes(1);
    expect(deleteLineItemMock).toHaveBeenCalledWith(ITEM, 'tok');
    expect(res).toEqual({ deleted: 1, notFound: 0, failed: 0 });
    expect(
      [...docs.keys()].some((k) => k.startsWith('lti_tool_columns/'))
    ).toBe(false);
  });

  it('leaves a column in a section the caller no longer teaches', async () => {
    docs.set('lti_tool_columns/S1/sections/222', {
      lineitemUrl: `${schoologySectionUrls('222').lineitemsUrl}/9`,
    });
    nrpsMock.mockImplementation(teachesOnly111);
    const res = await del({ auth: T, data: { sessionId: 'S1' } });
    expect(deleteLineItemMock).toHaveBeenCalledTimes(1);
    expect(deleteLineItemMock).toHaveBeenCalledWith(ITEM, 'tok');
    expect(res).toEqual({ deleted: 1, notFound: 0, failed: 1 });
    expect(docs.has('lti_tool_columns/S1/sections/222')).toBe(true);
    expect(docs.has('lti_tool_columns/S1')).toBe(true);
  });

  it('refuses another teacher', async () => {
    await expect(
      del({
        auth: { uid: 'teacher-2', token: { email: 'x@y' } },
        data: { sessionId: 'S1' },
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(deleteLineItemMock).not.toHaveBeenCalled();
  });

  it('is a no-op for an assignment with no columns', async () => {
    const res = await del({ auth: T, data: { sessionId: 'S2' } });
    expect(res).toEqual({ deleted: 0, notFound: 0, failed: 0 });
  });
});
