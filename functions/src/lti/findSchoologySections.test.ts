/* eslint-disable @typescript-eslint/require-await -- mock async handlers mirror
   the async Admin-SDK / network surface without awaiting anything. */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Staff is decided by an org member doc (districtStaff.ts); here any verified non-student token is staff.
const districtStaffMock = vi.hoisted(() =>
  vi.fn(
    (
      _db: unknown,
      token: { email_verified?: boolean; studentRole?: unknown }
    ): Promise<boolean> =>
      Promise.resolve(
        token.email_verified === true && token.studentRole !== true
      )
  )
);
vi.mock('../districtStaff', () => ({
  isDistrictStaffToken: districtStaffMock,
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
  return { onCall: (_o: unknown, handler: unknown) => handler, HttpsError };
});

// Dev has a placeholder REST key: tests flip this to use it.
const restKey = { on: true };
vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({
    value: () =>
      name === 'SCHOOLOGY_API_CONSUMER_KEY' && !restKey.on
        ? 'placeholder'
        : `secret:${name}`,
  }),
}));

let rosters: { id: string; data: Record<string, unknown> }[] = [];
const courseLinks = new Map<string, Record<string, unknown>>();

vi.mock('../firebaseAdmin', () => ({
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
          where: (field: string, _op: string, value: string) => {
            const q = {
              limit: () => q,
              get: async () => ({
                docs: [...courseLinks]
                  .filter(([, v]) => v[field] === value)
                  .map(([id, v]) => ({ id, data: () => v, ref: { _ctx: id } })),
              }),
            };
            return q;
          },
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
    batch: () => ({
      delete: (ref: { _ctx: string }) => courseLinks.delete(ref._ctx),
      commit: async () => undefined,
    }),
    runTransaction: async (
      fn: (tx: {
        get: (ref: { _ctx: string }) => Promise<{
          exists: boolean;
          data: () => unknown;
        }>;
        set: (ref: { _ctx: string }, data: Record<string, unknown>) => void;
        delete: (ref: { _ctx: string }) => void;
      }) => Promise<unknown>
    ) =>
      fn({
        get: async (ref) =>
          '_ctx' in ref
            ? {
                exists: courseLinks.has(ref._ctx),
                data: () => courseLinks.get(ref._ctx),
              }
            : (ref as unknown as { get: () => Promise<never> }).get(),
        set: (ref, data) =>
          courseLinks.set(ref._ctx, {
            ...(courseLinks.get(ref._ctx) ?? {}),
            ...data,
          }),
        delete: (ref) => courseLinks.delete(ref._ctx),
      }),
  })),
}));

vi.mock('./config', async (orig) => ({
  ...(await orig<typeof import('./config')>()),
  getLtiPlatformConfig: vi
    .fn()
    .mockResolvedValue({ clientId: 'client-1', tokenUrl: 'https://lms/token' }),
}));

const tokenMock = vi.hoisted(() => vi.fn());
vi.mock('./ags', () => ({ getAgsAccessToken: tokenMock }));

const { fetchNrpsMembershipMock, sectionMock, periodMock } = vi.hoisted(() => ({
  fetchNrpsMembershipMock: vi.fn(),
  sectionMock: vi.fn(),
  periodMock: vi.fn(),
}));
vi.mock('./nrps', () => ({ fetchNrpsMembership: fetchNrpsMembershipMock }));
vi.mock('../schoology/restClient', () => ({
  getSectionBySisId: sectionMock,
  getGradingPeriod: periodMock,
}));

import { inBatches, ltiFindSchoologySectionsV1 } from './findSchoologySections';

type Req = {
  auth?: { uid: string; token: Record<string, unknown> };
  data: unknown;
};
type Row = Record<string, unknown>;
const call = ltiFindSchoologySectionsV1 as unknown as (
  r: Req
) => Promise<{ rows: Row[] }>;

const INSTRUCTOR =
  'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor';
const TEACHER = {
  uid: 'teacher-1',
  token: { email: 'T@orono.k12.mn.us', email_verified: true },
};
const instructor = (email: string) => ({
  userId: `${email}-sub`,
  givenName: '',
  familyName: '',
  email,
  roles: [INSTRUCTOR],
  status: 'Active',
});

// cl-1 and cl-2 have sections; cl-none has no Schoology course.
const SECTIONS: Record<string, { id: string; title: string }> = {
  'cl-1': { id: '111', title: 'BIOLOGY A: (S1) P5' },
  'cl-2': { id: '222', title: 'BIOLOGY A: (S1) P6' },
};

const byRoster = (rows: Row[]) =>
  Object.fromEntries(rows.map((r) => [r.rosterId as string, r]));

beforeEach(() => {
  restKey.on = true;
  rosters = [
    { id: 'r-1', data: { classlinkClassId: 'cl-1', classlinkOrgId: 'org' } },
    { id: 'r-2', data: { classlinkClassId: 'cl-2' } },
    { id: 'r-none', data: { classlinkClassId: 'cl-none' } },
    { id: 'r-test', data: { testClassId: 'mock-p1' } },
  ];
  courseLinks.clear();
  tokenMock.mockReset().mockResolvedValue('nrps-token');
  sectionMock
    .mockReset()
    .mockImplementation(async (_c: unknown, sis: string) => {
      const s = SECTIONS[sis];
      return s
        ? { ...s, sisId: sis.toUpperCase(), gradingPeriodIds: ['9'] }
        : null;
    });
  periodMock.mockReset().mockResolvedValue({
    id: '9',
    title: 'HS Semester 1 (26-27)',
    start: '2026-09-01',
    end: '2027-01-22',
  });
  fetchNrpsMembershipMock.mockReset().mockResolvedValue({
    contextTitle: null,
    members: [instructor('t@orono.k12.mn.us')],
  });
});

describe('ltiFindSchoologySectionsV1 find', () => {
  it('pairs each ClassLink class with its section by SIS id', async () => {
    const { rows } = await call({ auth: TEACHER, data: {} });
    const r = byRoster(rows);
    expect(r['r-1']).toMatchObject({
      status: 'ready',
      contextId: '111',
      contextTitle: 'BIOLOGY A: (S1) P5',
      periodTitle: 'HS Semester 1 (26-27)',
      replacesTitle: null,
    });
    expect(r['r-2']).toMatchObject({ status: 'ready', contextId: '222' });
    expect(r['r-none']).toEqual({ rosterId: 'r-none', status: 'none' });
    // Test classes have no SIS id.
    expect(r['r-test']).toBeUndefined();
    expect(periodMock).toHaveBeenCalledTimes(1);
    expect(courseLinks.size).toBe(0);
  });

  it('gives a class imported twice one row, for the newest roster', async () => {
    rosters = [
      { id: 'r-old', data: { classlinkClassId: 'cl-1', classlinkSyncedAt: 1 } },
      { id: 'r-new', data: { classlinkClassId: 'cl-1', classlinkSyncedAt: 5 } },
    ];
    const { rows } = await call({ auth: TEACHER, data: {} });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rosterId: 'r-new', status: 'ready' });
    expect(sectionMock).toHaveBeenCalledTimes(1);
  });

  it('offers a co-taught section another teacher linked', async () => {
    courseLinks.set('111', { teacherUid: 'teacher-2', rosterId: 'x' });
    const r = byRoster((await call({ auth: TEACHER, data: {} })).rows);
    expect(r['r-1'].status).toBe('ready');
  });

  it("shows a co-teacher's own link as linked", async () => {
    courseLinks.set('111', { teacherUid: 'teacher-2', rosterId: 'x' });
    courseLinks.set('111~teacher-1', {
      teacherUid: 'teacher-1',
      contextId: '111',
      rosterId: 'r-1',
      classlinkClassId: 'cl-1',
    });
    const r = byRoster((await call({ auth: TEACHER, data: {} })).rows);
    expect(r['r-1'].status).toBe('linked');
  });

  it('needs the caller to be an NRPS instructor', async () => {
    fetchNrpsMembershipMock.mockResolvedValue({
      contextTitle: null,
      members: [instructor('other@orono.k12.mn.us')],
    });
    const r = byRoster((await call({ auth: TEACHER, data: {} })).rows);
    expect(r['r-1'].status).toBe('not-teacher');
  });

  it('shows an existing link and the one a new link would replace', async () => {
    courseLinks.set('111', {
      teacherUid: 'teacher-1',
      rosterId: 'r-1',
      classlinkClassId: 'cl-1',
    });
    courseLinks.set('999', {
      teacherUid: 'teacher-1',
      rosterId: 'r-2',
      classlinkClassId: 'cl-2',
      contextTitle: '(S2) BIOLOGY B',
    });
    const r = byRoster((await call({ auth: TEACHER, data: {} })).rows);
    expect(r['r-1'].status).toBe('linked');
    expect(r['r-2']).toMatchObject({
      status: 'ready',
      replacesTitle: '(S2) BIOLOGY B',
    });
  });

  it('names the other class a section would move from', async () => {
    courseLinks.set('222', {
      teacherUid: 'teacher-1',
      rosterId: 'r-1',
      classlinkClassId: 'cl-1',
      contextTitle: 'BIOLOGY A: (S1) P6',
    });
    const r = byRoster((await call({ auth: TEACHER, data: {} })).rows);
    expect(r['r-2']).toMatchObject({
      status: 'ready',
      movesFromRosterId: 'r-1',
    });
    expect(r['r-1'].movesFromRosterId).toBeNull();
  });

  it('still flags a move when the old link has no roster id', async () => {
    courseLinks.set('222', {
      teacherUid: 'teacher-1',
      classlinkClassId: 'cl-1',
    });
    const r = byRoster((await call({ auth: TEACHER, data: {} })).rows);
    expect(r['r-2'].movesFromRosterId).toBe('r-1');
  });

  it('retries the NRPS token instead of failing every row', async () => {
    // Six sections: the first five share the failed request, the sixth retries.
    rosters = Array.from({ length: 6 }, (_, i) => ({
      id: `r${i}`,
      data: { classlinkClassId: `c${i}` },
    }));
    sectionMock.mockImplementation(async (_c: unknown, sis: string) => ({
      id: `${sis.slice(1)}00`,
      title: sis,
      sisId: sis,
      gradingPeriodIds: [],
    }));
    tokenMock.mockRejectedValueOnce(new Error('token 500'));
    const r = byRoster((await call({ auth: TEACHER, data: {} })).rows);
    expect(r.r5.status).toBe('ready');
    expect(tokenMock).toHaveBeenCalledTimes(2);
  });

  it('ignores a section whose SIS id does not match', async () => {
    sectionMock.mockResolvedValue({
      id: '111',
      title: 'x',
      sisId: 'someone-else',
      gradingPeriodIds: [],
    });
    const r = byRoster((await call({ auth: TEACHER, data: {} })).rows);
    expect(r['r-1'].status).toBe('none');
  });

  it('reports a failed lookup per class', async () => {
    sectionMock.mockRejectedValueOnce(new Error('500'));
    const r = byRoster((await call({ auth: TEACHER, data: {} })).rows);
    expect(r['r-1'].status).toBe('error');
    expect(r['r-2'].status).toBe('ready');
  });

  it('needs the REST key', async () => {
    restKey.on = false;
    await expect(call({ auth: TEACHER, data: {} })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('refuses students and signed-out callers', async () => {
    await expect(call({ data: {} })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(
      call({
        auth: {
          uid: 's',
          token: { email: 's@x', email_verified: true, studentRole: true },
        },
        data: {},
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('inBatches', () => {
  it('gives items unfinished at the deadline their late value', async () => {
    const out = await inBatches(
      [1, 2, 3],
      (n) =>
        n === 2
          ? new Promise<string>(() => undefined)
          : Promise.resolve(`ok${n}`),
      Date.now() + 50,
      (n) => `late${n}`
    );
    expect(out).toEqual(['ok1', 'late2', 'ok3']);
  });

  it('starts nothing after the deadline', async () => {
    const fn = vi.fn(async (n: number) => n);
    expect(await inBatches([1, 2], fn, Date.now() - 1, () => 0)).toEqual([
      0, 0,
    ]);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('ltiFindSchoologySectionsV1 link', () => {
  it('links the chosen classes and replaces an old link', async () => {
    courseLinks.set('999', {
      teacherUid: 'teacher-1',
      rosterId: 'r-2',
      classlinkClassId: 'cl-2',
      contextTitle: '(S2) BIOLOGY B',
    });
    const r = byRoster(
      (await call({ auth: TEACHER, data: { rosterIds: ['r-1', 'r-2'] } })).rows
    );
    expect(r['r-1']).toMatchObject({ status: 'linked', replacedIds: [] });
    expect(r['r-2']).toMatchObject({
      status: 'linked',
      replaced: ['(S2) BIOLOGY B'],
      replacedIds: ['999'],
    });
    expect(courseLinks.get('111')).toMatchObject({
      teacherUid: 'teacher-1',
      rosterId: 'r-1',
      classlinkClassId: 'cl-1',
      classlinkOrgId: 'org',
      contextTitle: 'BIOLOGY A: (S1) P5',
      linkedBy: 'sis',
    });
    expect(courseLinks.has('999')).toBe(false);
  });

  it('checks each class again and links only what passes', async () => {
    courseLinks.set('222', { teacherUid: 'teacher-2' });
    const r = byRoster(
      (
        await call({
          auth: TEACHER,
          data: { rosterIds: ['r-1', 'r-2', 'r-none', 'not-mine'] },
        })
      ).rows
    );
    expect(r['r-1'].status).toBe('linked');
    expect(r['r-2'].status).toBe('linked');
    expect(r['r-none'].status).toBe('none');
    expect(r['not-mine']).toMatchObject({ status: 'error' });
    expect(courseLinks.get('222')).toEqual({ teacherUid: 'teacher-2' });
    expect(courseLinks.get('222~teacher-1')).toMatchObject({
      teacherUid: 'teacher-1',
      contextId: '222',
      rosterId: 'r-2',
      linkedBy: 'sis',
    });
  });

  it('stops linking near the time limit and reports the rest as errors', async () => {
    let clock = Date.now();
    const now = vi.spyOn(Date, 'now').mockImplementation(() => clock);
    const set = courseLinks.set.bind(courseLinks);
    const spy = vi.spyOn(courseLinks, 'set').mockImplementation((k, v) => {
      clock += 200_000;
      return set(k, v);
    });
    try {
      const r = byRoster(
        (await call({ auth: TEACHER, data: { rosterIds: ['r-1', 'r-2'] } }))
          .rows
      );
      expect(r['r-1'].status).toBe('linked');
      expect(r['r-2'].status).toBe('error');
      expect(courseLinks.has('222')).toBe(false);
    } finally {
      spy.mockRestore();
      now.mockRestore();
    }
  });

  it('rejects bad roster ids', async () => {
    for (const rosterIds of [[], ['a/b'], 'r-1', [1]]) {
      await expect(
        call({ auth: TEACHER, data: { rosterIds } })
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    }
  });
});
