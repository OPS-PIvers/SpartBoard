// Unit tests for plcContentWriteV1: request parsing, the transaction runner and the caller gates.
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Hoisted {
  db: unknown;
  viewAs: ReturnType<typeof vi.fn<() => Promise<null>>>;
}
const h: Hoisted = vi.hoisted(() => ({
  db: undefined,
  viewAs: vi.fn<() => Promise<null>>(() => Promise.resolve(null)),
}));

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(() => h.db, {
    FieldValue: {
      serverTimestamp: () => 'SERVER_TS',
      delete: () => 'DELETE',
    },
  }),
}));
vi.mock('./viewAsGuard', () => ({ assertViewAsAllowed: h.viewAs }));
vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  }
  return {
    onCall: (_o: unknown, fn: unknown) => fn,
    HttpsError: FakeHttpsError,
  };
});

import type * as admin from './firebaseAdmin';
import {
  parsePlcContentWriteRequest,
  plcContentWriteV1,
  runPlcContentWrites,
} from './plcContentWrites';
import { SENTINEL_KEY } from './plcContentRules';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

const NOW = { seconds: 1, nanoseconds: 0, toMillis: () => 1000 };
const deps = {
  serverTime: () => 'SERVER_TS',
  deleteField: () => 'DELETE',
  now: () => NOW,
};

const plc = (): StubData => ({
  leadUid: 'lead',
  memberUids: ['lead', 'mem', 'view'],
  members: {
    lead: { role: 'lead', status: 'active' },
    mem: { role: 'member', status: 'active' },
    view: { role: 'viewer', status: 'active' },
  },
});

const quiz = (id: string, sharedBy = 'mem'): StubData => ({
  id,
  title: 'Quiz',
  questionCount: 4,
  syncGroupId: 'g1',
  sharedBy,
  sharedByEmail: `${sharedBy}@x.edu`,
  sharedByName: sharedBy,
  sharedAt: 10,
  updatedAt: 10,
});

const setup = (seed: Record<string, StubData> = {}) => {
  const stub = makeStubFirestore({ 'plcs/p': plc(), ...seed });
  return { stub, db: stub.db as unknown as admin.firestore.Firestore };
};

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as { code: string }).code;
  }
  return null;
};

describe('parsePlcContentWriteRequest', () => {
  const ok = { op: 'set', coll: 'quizzes', id: 'q1', data: { title: 'x' } };
  it('accepts a valid batch', () => {
    expect(parsePlcContentWriteRequest({ plcId: 'p', writes: [ok] })).toEqual({
      plcId: 'p',
      writes: [ok],
    });
  });

  it.each([
    ['a missing plcId', { writes: [ok] }],
    ['a plcId with a slash', { plcId: 'a/b', writes: [ok] }],
    ['no writes', { plcId: 'p', writes: [] }],
    [
      'over 100 writes',
      {
        plcId: 'p',
        writes: Array.from({ length: 101 }, (_, i) => ({ ...ok, id: `q${i}` })),
      },
    ],
    [
      'an unknown collection',
      { plcId: 'p', writes: [{ ...ok, coll: 'notes' }] },
    ],
    ['an unknown op', { plcId: 'p', writes: [{ ...ok, op: 'merge' }] }],
    ['a doc id with a slash', { plcId: 'p', writes: [{ ...ok, id: 'a/b' }] }],
    ['the same doc twice', { plcId: 'p', writes: [ok, ok] }],
    [
      'a dotted field path',
      { plcId: 'p', writes: [{ ...ok, data: { 'a.b': 1 } }] },
    ],
    [
      'a reserved field name',
      { plcId: 'p', writes: [{ ...ok, data: { __x: 1 } }] },
    ],
    [
      'deleteField in a set',
      {
        plcId: 'p',
        writes: [{ ...ok, data: { title: { [SENTINEL_KEY]: 'deleteField' } } }],
      },
    ],
    ['array data', { plcId: 'p', writes: [{ ...ok, data: [] }] }],
    [
      'a nested sentinel',
      {
        plcId: 'p',
        writes: [
          {
            ...ok,
            op: 'update',
            data: { sessionOptions: { a: [{ [SENTINEL_KEY]: 'serverTime' }] } },
          },
        ],
      },
    ],
  ])('rejects %s', (_label, raw) => {
    expect(() => parsePlcContentWriteRequest(raw)).toThrow();
  });
});

describe('runPlcContentWrites', () => {
  it('creates a doc the rules would allow', async () => {
    const { stub, db } = setup();
    await runPlcContentWrites(
      db,
      { uid: 'mem' },
      {
        plcId: 'p',
        writes: [{ op: 'set', coll: 'quizzes', id: 'q1', data: quiz('q1') }],
      },
      deps
    );
    expect(stub.get('plcs/p/quizzes/q1')).toEqual(quiz('q1'));
  });

  it('refuses a viewer, a non-member and a missing PLC', async () => {
    const write = {
      op: 'set' as const,
      coll: 'quizzes' as const,
      id: 'q1',
      data: quiz('q1', 'view'),
    };
    const { db } = setup();
    expect(
      await codeOf(
        runPlcContentWrites(
          db,
          { uid: 'view' },
          { plcId: 'p', writes: [write] },
          deps
        )
      )
    ).toBe('permission-denied');
    expect(
      await codeOf(
        runPlcContentWrites(
          db,
          { uid: 'out' },
          { plcId: 'p', writes: [{ ...write, data: quiz('q1', 'out') }] },
          deps
        )
      )
    ).toBe('permission-denied');
    expect(
      await codeOf(
        runPlcContentWrites(
          db,
          { uid: 'mem' },
          { plcId: 'gone', writes: [{ ...write, data: quiz('q1') }] },
          deps
        )
      )
    ).toBe('permission-denied');
  });

  it('merges an update onto the stored doc and keeps attribution frozen', async () => {
    const { stub, db } = setup({ 'plcs/p/quizzes/q1': quiz('q1', 'lead') });
    await runPlcContentWrites(
      db,
      { uid: 'mem' },
      {
        plcId: 'p',
        writes: [
          {
            op: 'update',
            coll: 'quizzes',
            id: 'q1',
            data: { title: 'Renamed', updatedAt: 20 },
          },
        ],
      },
      deps
    );
    expect(stub.get('plcs/p/quizzes/q1')).toMatchObject({
      title: 'Renamed',
      sharedBy: 'lead',
    });
    expect(
      await codeOf(
        runPlcContentWrites(
          db,
          { uid: 'mem' },
          {
            plcId: 'p',
            writes: [
              {
                op: 'update',
                coll: 'quizzes',
                id: 'q1',
                data: { sharedBy: 'mem' },
              },
            ],
          },
          deps
        )
      )
    ).toBe('permission-denied');
  });

  it('a set over an existing doc is checked as an update', async () => {
    const { db } = setup({ 'plcs/p/quizzes/q1': quiz('q1', 'lead') });
    // A fresh create payload changes sharedBy, which the update rule freezes.
    expect(
      await codeOf(
        runPlcContentWrites(
          db,
          { uid: 'mem' },
          {
            plcId: 'p',
            writes: [
              { op: 'set', coll: 'quizzes', id: 'q1', data: quiz('q1') },
            ],
          },
          deps
        )
      )
    ).toBe('permission-denied');
  });

  it('an update of a missing doc is not-found', async () => {
    const { db } = setup();
    expect(
      await codeOf(
        runPlcContentWrites(
          db,
          { uid: 'mem' },
          {
            plcId: 'p',
            writes: [
              {
                op: 'update',
                coll: 'assignment_index',
                id: 'a1',
                data: { status: 'paused' },
              },
            ],
          },
          deps
        )
      )
    ).toBe('not-found');
  });

  it('turns sentinels into server values and checks them as timestamps', async () => {
    const { stub, db } = setup();
    const serverTime = { [SENTINEL_KEY]: 'serverTime' };
    await runPlcContentWrites(
      db,
      { uid: 'mem' },
      {
        plcId: 'p',
        writes: [
          {
            op: 'set',
            coll: 'docs',
            id: 'd1',
            data: {
              id: 'd1',
              title: 'Doc',
              url: 'https://docs.google.com/d',
              createdBy: 'mem',
              createdByName: 'Mem',
              createdAt: serverTime,
              updatedAt: serverTime,
            },
          },
        ],
      },
      deps
    );
    expect(stub.get('plcs/p/docs/d1')).toMatchObject({
      createdAt: 'SERVER_TS',
      updatedAt: 'SERVER_TS',
    });
  });

  it('is all or nothing across a batch', async () => {
    const { stub, db } = setup();
    const code = await codeOf(
      runPlcContentWrites(
        db,
        { uid: 'mem' },
        {
          plcId: 'p',
          writes: [
            { op: 'set', coll: 'quizzes', id: 'q1', data: quiz('q1') },
            {
              op: 'set',
              coll: 'quizzes',
              id: 'q2',
              data: { ...quiz('q2'), questionCount: -1 },
            },
          ],
        },
        deps
      )
    );
    expect(code).toBe('permission-denied');
    expect(stub.get('plcs/p/quizzes/q1')).toBeUndefined();
  });

  it('only the sharer deletes a flashcard result; any editor deletes a quiz', async () => {
    const result = { id: 'r1', sharedBy: 'lead' };
    const { stub, db } = setup({
      'plcs/p/flashcard_results/r1': result,
      'plcs/p/quizzes/q1': quiz('q1', 'lead'),
    });
    expect(
      await codeOf(
        runPlcContentWrites(
          db,
          { uid: 'mem' },
          {
            plcId: 'p',
            writes: [{ op: 'delete', coll: 'flashcard_results', id: 'r1' }],
          },
          deps
        )
      )
    ).toBe('permission-denied');
    await runPlcContentWrites(
      db,
      { uid: 'mem' },
      { plcId: 'p', writes: [{ op: 'delete', coll: 'quizzes', id: 'q1' }] },
      deps
    );
    expect(stub.get('plcs/p/quizzes/q1')).toBeUndefined();
    await runPlcContentWrites(
      db,
      { uid: 'lead' },
      {
        plcId: 'p',
        writes: [{ op: 'delete', coll: 'flashcard_results', id: 'r1' }],
      },
      deps
    );
    expect(stub.get('plcs/p/flashcard_results/r1')).toBeUndefined();
  });
});

describe('review fixes', () => {
  it('refuses -0 and unsafe integers where the rules want an int', async () => {
    const { db } = setup();
    for (const questionCount of [-0, 1e300]) {
      expect(
        await codeOf(
          runPlcContentWrites(
            db,
            { uid: 'mem' },
            {
              plcId: 'p',
              writes: [
                {
                  op: 'set',
                  coll: 'quizzes',
                  id: 'q1',
                  data: { ...quiz('q1'), questionCount },
                },
              ],
            },
            deps
          )
        )
      ).toBe('permission-denied');
    }
  });

  it('refuses everyone when the members map or the entry is malformed, as the rules error', async () => {
    for (const members of [{ mem: 'member' }, ['mem']]) {
      const { db } = setup({ 'plcs/p': { ...plc(), members } });
      expect(
        await codeOf(
          runPlcContentWrites(
            db,
            { uid: 'mem' },
            {
              plcId: 'p',
              writes: [
                { op: 'set', coll: 'quizzes', id: 'q1', data: quiz('q1') },
              ],
            },
            deps
          )
        )
      ).toBe('permission-denied');
    }
  });

  it('tells only members that a doc is missing', async () => {
    const { db } = setup();
    const req = {
      plcId: 'p',
      writes: [
        {
          op: 'update' as const,
          coll: 'quizzes' as const,
          id: 'nope',
          data: { title: 'x' },
        },
      ],
    };
    expect(
      await codeOf(runPlcContentWrites(db, { uid: 'out' }, req, deps))
    ).toBe('permission-denied');
    expect(
      await codeOf(runPlcContentWrites(db, { uid: 'mem' }, req, deps))
    ).toBe('not-found');
  });
});

describe('plcContentWriteV1', () => {
  const call = plcContentWriteV1 as unknown as (
    req: unknown
  ) => Promise<unknown>;
  const write = { op: 'set', coll: 'quizzes', id: 'q1', data: quiz('q1') };

  beforeEach(() => {
    h.viewAs.mockReset();
    h.viewAs.mockResolvedValue(null);
  });

  it('writes for a live member', async () => {
    const { stub, db } = setup();
    h.db = db;
    await call({
      auth: { uid: 'mem', token: { email: 'mem@x.edu' } },
      data: { plcId: 'p', writes: [write] },
    });
    expect(stub.get('plcs/p/quizzes/q1')).toMatchObject({ title: 'Quiz' });
  });

  it('refuses a signed-out caller, a PIN token and a deactivated member', async () => {
    const { stub, db } = setup({
      'organizations/orono/members/mem@x.edu': { status: 'deactivated' },
    });
    h.db = db;
    expect(
      await codeOf(call({ auth: null, data: { plcId: 'p', writes: [write] } }))
    ).toBe('unauthenticated');
    expect(
      await codeOf(
        call({
          auth: { uid: 'mem', token: { pinLogin: true } },
          data: { plcId: 'p', writes: [write] },
        })
      )
    ).toBe('permission-denied');
    expect(
      await codeOf(
        call({
          auth: { uid: 'mem', token: { email: 'mem@x.edu' } },
          data: { plcId: 'p', writes: [write] },
        })
      )
    ).toBe('permission-denied');
    expect(
      await codeOf(
        call({
          auth: { uid: 'mem', token: { deactivated: true } },
          data: { plcId: 'p', writes: [write] },
        })
      )
    ).toBe('permission-denied');
    expect(stub.get('plcs/p/quizzes/q1')).toBeUndefined();
  });

  it('runs the View as write guard first', async () => {
    const { db } = setup();
    h.db = db;
    h.viewAs.mockRejectedValue(
      Object.assign(new Error('Unlock edits to do this.'), {
        code: 'permission-denied',
      })
    );
    expect(
      await codeOf(
        call({
          auth: { uid: 'mem', token: {} },
          data: { plcId: 'p', writes: [write] },
        })
      )
    ).toBe('permission-denied');
    expect(h.viewAs).toHaveBeenCalledWith(expect.anything());
  });
});
