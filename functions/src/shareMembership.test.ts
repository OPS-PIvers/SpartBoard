// Unit tests for shareMembershipV1: board and collection link joins and leaves mirror their firestore.rules gates.
import { describe, it, expect, vi } from 'vitest';

const authUsers = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { delete: () => 'DELETE' },
  }),
  auth: () => ({
    getUser: (uid: string) =>
      authUsers.has(uid)
        ? Promise.resolve(authUsers.get(uid))
        : Promise.reject(new Error('no user')),
  }),
}));
const viewAsGuard = vi.hoisted(() => ({
  assertViewAsAllowed: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('./viewAsGuard', () => viewAsGuard);
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
  return { onCall: (_o: unknown, h: unknown) => h, HttpsError: FakeHttpsError };
});

import * as admin from './firebaseAdmin';
import {
  lcShapeOk,
  makeHostLookup,
  parseShareMembershipAction,
  planBoardJoin,
  planCollectionJoin,
  readShareHost,
  runShareMembershipAction,
  type Caller,
  type HostLookup,
  type ShareMembershipAction,
} from './shareMembership';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

const staff: Caller = { uid: 'u1', staff: true };
const notStaff: Caller = { uid: 'u1', staff: false };
const notAllowed = { reason: 'notAllowed' };

const link = (extra: StubData = {}): StubData => ({
  mode: 'synced',
  name: 'Unit 1',
  boards: [],
  participants: {},
  hostUid: 'host',
  ...extra,
});

describe('planBoardJoin', () => {
  it('lets staff join a synced share with any role', () => {
    expect(
      planBoardJoin(staff, { intendedMode: 'synced' }, 'collaborator', 'Ann', 5)
    ).toEqual({
      role: 'collaborator',
      joinedAt: 5,
      displayName: 'Ann',
    });
  });

  it('keeps a View-Only join a viewer', () => {
    expect(
      planBoardJoin(
        staff,
        { intendedMode: 'view-only' },
        'viewer',
        undefined,
        5
      ).role
    ).toBe('viewer');
    expect(() =>
      planBoardJoin(
        staff,
        { intendedMode: 'view-only' },
        'collaborator',
        undefined,
        5
      )
    ).toThrow(expect.objectContaining(notAllowed));
  });

  it('refuses substitute and copy shares, a second join, and non-staff', () => {
    for (const mode of ['substitute', 'copy']) {
      expect(() =>
        planBoardJoin(staff, { intendedMode: mode }, 'viewer', undefined, 5)
      ).toThrow(expect.objectContaining(notAllowed));
    }
    expect(() =>
      planBoardJoin(
        staff,
        { intendedMode: 'synced', participants: { u1: { role: 'viewer' } } },
        'collaborator',
        undefined,
        5
      )
    ).toThrow(expect.objectContaining(notAllowed));
    expect(() =>
      planBoardJoin(
        notStaff,
        { intendedMode: 'synced' },
        'viewer',
        undefined,
        5
      )
    ).toThrow(expect.objectContaining(notAllowed));
  });
});

describe('planCollectionJoin', () => {
  it('grants the role the mode gives', () => {
    expect(planCollectionJoin(staff, link(), 'Ann', 5)).toEqual({
      role: 'collaborator',
      joinedAt: 5,
      name: 'Ann',
    });
    expect(
      planCollectionJoin(staff, link({ mode: 'view-only' }), undefined, 5)
    ).toEqual({ role: 'viewer', joinedAt: 5 });
  });

  it('refuses an ended link, a removed teacher, a second join, non-staff and a full link', () => {
    expect(() =>
      planCollectionJoin(staff, link({ ended: true }), undefined, 5)
    ).toThrow(expect.objectContaining(notAllowed));
    expect(() =>
      planCollectionJoin(staff, link({ removed: { u1: 1 } }), undefined, 5)
    ).toThrow(expect.objectContaining(notAllowed));
    expect(() =>
      planCollectionJoin(
        staff,
        link({ participants: { u1: {} } }),
        undefined,
        5
      )
    ).toThrow(expect.objectContaining(notAllowed));
    expect(() => planCollectionJoin(notStaff, link(), undefined, 5)).toThrow(
      expect.objectContaining(notAllowed)
    );
    const full = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`p${i}`, {}])
    );
    expect(() =>
      planCollectionJoin(staff, link({ participants: full }), undefined, 5)
    ).toThrow(expect.objectContaining(notAllowed));
  });

  it('caps the name at 100 characters', () => {
    expect(
      planCollectionJoin(staff, link(), 'x'.repeat(150), 5).name
    ).toHaveLength(100);
  });
});

describe('lcShapeOk', () => {
  it('needs a known mode and a named link', () => {
    expect(lcShapeOk(link())).toBe(true);
    expect(lcShapeOk(link({ mode: 'copy' }))).toBe(false);
    expect(lcShapeOk(link({ name: '' }))).toBe(false);
  });
});

describe('parseShareMembershipAction', () => {
  it('refuses unknown roles and path-breaking ids', () => {
    expect(() =>
      parseShareMembershipAction({
        action: 'joinBoard',
        shareId: 's',
        role: 'host',
      })
    ).toThrow(expect.objectContaining({ reason: 'invalidArgument' }));
    expect(() =>
      parseShareMembershipAction({ action: 'leaveBoard', shareId: 'a/b' })
    ).toThrow(expect.objectContaining({ reason: 'invalidArgument' }));
  });
});

describe('runShareMembershipAction', () => {
  const run = (db: unknown, c: Caller, a: unknown, lookup?: HostLookup) =>
    runShareMembershipAction(
      db as admin.firestore.Firestore,
      c,
      parseShareMembershipAction(a) as Exclude<
        ShareMembershipAction,
        { action: 'shareHost' }
      >,
      7,
      lookup
    );

  it('refuses to join a share whose host is not staff', async () => {
    const { db, writes } = makeStubFirestore({
      'shared_boards/s': { intendedMode: 'synced', originalAuthor: 'anon' },
    });
    const lookup = vi.fn(() => Promise.resolve({ staff: false }));
    await expect(
      run(
        db,
        staff,
        { action: 'joinBoard', shareId: 's', role: 'collaborator' },
        lookup
      )
    ).rejects.toMatchObject(notAllowed);
    expect(lookup).toHaveBeenCalledWith('anon');
    expect(writes).toEqual([]);
  });

  it('joins a share whose host is staff', async () => {
    const { db, writes } = makeStubFirestore({
      'shared_boards/s': { intendedMode: 'synced', originalAuthor: 'host' },
    });
    await run(
      db,
      staff,
      { action: 'joinBoard', shareId: 's', role: 'viewer' },
      () => Promise.resolve({ staff: true })
    );
    expect(writes).toHaveLength(1);
  });

  it('writes only the caller participant entry on a join', async () => {
    const { db, writes } = makeStubFirestore({
      'shared_boards/s': { intendedMode: 'synced', originalAuthor: 'host' },
    });
    await run(db, staff, {
      action: 'joinBoard',
      shareId: 's',
      role: 'collaborator',
      displayName: 'Ann',
    });
    expect(writes).toEqual([
      {
        op: 'update',
        path: 'shared_boards/s',
        data: {
          'participants.u1': {
            role: 'collaborator',
            joinedAt: 7,
            displayName: 'Ann',
          },
        },
      },
    ]);
  });

  it('deletes only the caller entry on a leave, and does nothing when not a member', async () => {
    const { db, writes } = makeStubFirestore({
      'linked_collections/l': link({
        participants: { u1: { role: 'viewer' }, u2: { role: 'viewer' } },
      }),
      'shared_boards/s': { intendedMode: 'synced', participants: {} },
    });
    await run(db, staff, { action: 'leaveCollection', linkId: 'l' });
    expect(writes).toEqual([
      {
        op: 'update',
        path: 'linked_collections/l',
        data: { 'participants.u1': 'DELETE' },
      },
    ]);
    await expect(
      run(db, staff, { action: 'leaveBoard', shareId: 's' })
    ).resolves.toEqual({ changed: false });
    expect(writes).toHaveLength(1);
  });

  it('reports a missing share', async () => {
    const { db } = makeStubFirestore({});
    await expect(
      run(db, staff, { action: 'joinCollection', linkId: 'gone' })
    ).rejects.toMatchObject({ reason: 'notFound' });
  });
});

describe('readShareHost', () => {
  const ts = (ms: number) => ({ toMillis: () => ms });
  const fakeDb = (docs: Record<string, StubData & { _created?: number }>) =>
    ({
      doc: (path: string) => ({
        get: () => {
          const d = docs[path];
          return Promise.resolve({
            exists: !!d,
            data: () => d,
            createTime: d?._created === undefined ? undefined : ts(d._created),
          });
        },
      }),
    }) as unknown as admin.firestore.Firestore;
  const staffHost: HostLookup = () =>
    Promise.resolve({ staff: true, name: 'Ms. Lee' });

  it('names the host from the lookup, not the share doc', async () => {
    const db = fakeDb({
      'shared_boards/s': {
        originalAuthor: 'h',
        originalAuthorName: 'Mrs. Smith',
        intendedMode: 'synced',
      },
    });
    await expect(
      readShareHost(db, 'u1', 's', undefined, staffHost)
    ).resolves.toEqual({ hostStaff: true, hostName: 'Ms. Lee' });
    await expect(
      readShareHost(db, 'u1', 's', undefined, () =>
        Promise.resolve({ staff: false })
      )
    ).resolves.toEqual({ hostStaff: false });
  });

  it('flags a share created after the caller board as newer', async () => {
    const db = fakeDb({
      'shared_boards/s': { originalAuthor: 'h', _created: 200 },
      'users/u1/dashboards/old': { _created: 100 },
      'users/u1/dashboards/new': { _created: 300 },
    });
    await expect(
      readShareHost(db, 'u1', 's', 'old', staffHost)
    ).resolves.toMatchObject({ shareNewer: true });
    await expect(
      readShareHost(db, 'u1', 's', 'new', staffHost)
    ).resolves.toMatchObject({ shareNewer: false });
    await expect(
      readShareHost(db, 'u1', 's', 'missing', staffHost)
    ).resolves.not.toHaveProperty('shareNewer');
  });

  it('refuses substitute shares and reports missing ones', async () => {
    const db = fakeDb({
      'shared_boards/sub': { originalAuthor: 'h', intendedMode: 'substitute' },
    });
    await expect(
      readShareHost(db, 'u1', 'sub', undefined, staffHost)
    ).rejects.toMatchObject(notAllowed);
    await expect(
      readShareHost(db, 'u1', 'gone', undefined, staffHost)
    ).rejects.toMatchObject({ reason: 'notFound' });
  });

  it('parses a shareHost request', () => {
    expect(
      parseShareMembershipAction({
        action: 'shareHost',
        shareId: 's',
        boardId: 'b',
      })
    ).toEqual({ action: 'shareHost', shareId: 's', boardId: 'b' });
  });
});

describe('makeHostLookup', () => {
  const docs = (seed: Record<string, StubData>) => {
    const doc = (path: string) => ({
      get: () =>
        Promise.resolve({
          exists: path in seed,
          data: () => seed[path],
          get: (field: string) => seed[path]?.[field],
        }),
    });
    return {
      doc,
      collection: (name: string) => ({
        doc: (id: string) => doc(`${name}/${id}`),
      }),
    } as unknown as admin.firestore.Firestore;
  };
  const teacher = 'ann@orono.k12.mn.us';
  const member = `organizations/orono/members/${teacher}`;
  const user = (claims: Record<string, unknown> = {}) =>
    authUsers.set('h', {
      email: teacher,
      emailVerified: true,
      displayName: 'Ann',
      customClaims: claims,
    });

  it('treats a studentRole claim as not staff, as the rules do', async () => {
    const db = docs({ [member]: { roleId: 'teacher', status: 'active' } });
    user();
    await expect(makeHostLookup(db)('h')).resolves.toEqual({
      staff: true,
      name: 'Ann',
    });
    user({ studentRole: true });
    await expect(makeHostLookup(db)('h')).resolves.toMatchObject({
      staff: false,
    });
  });

  it('counts an /admins doc only while the admin is not deactivated', async () => {
    const admins = { [`admins/${teacher}`]: {} };
    user();
    await expect(makeHostLookup(docs(admins))('h')).resolves.toMatchObject({
      staff: true,
    });
    user({ deactivated: true });
    await expect(makeHostLookup(docs(admins))('h')).resolves.toMatchObject({
      staff: false,
    });
    user();
    await expect(
      makeHostLookup(
        docs({
          ...admins,
          [member]: { roleId: 'teacher', status: 'inactive' },
        })
      )('h')
    ).resolves.toMatchObject({ staff: false });
  });
});

describe('shareMembershipV1 View-as guard', () => {
  const stop = new Error('guard stop');
  const call = async (data: unknown) => {
    const { shareMembershipV1 } = await import('./shareMembership');
    const handler = shareMembershipV1 as unknown as (
      request: unknown
    ) => Promise<unknown>;
    return handler({ auth: { uid: 'u1', token: {} }, data });
  };

  it('lets a read-only View-as tab confirm a share host', async () => {
    viewAsGuard.assertViewAsAllowed.mockClear();
    viewAsGuard.assertViewAsAllowed.mockRejectedValueOnce(stop);
    await expect(call({ action: 'shareHost', shareId: 's' })).rejects.toBe(
      stop
    );
    expect(viewAsGuard.assertViewAsAllowed).toHaveBeenCalledWith(
      expect.anything(),
      { read: true }
    );
  });

  it('keeps joins behind the write guard', async () => {
    viewAsGuard.assertViewAsAllowed.mockClear();
    viewAsGuard.assertViewAsAllowed.mockRejectedValueOnce(stop);
    await expect(call({ action: 'leaveBoard', shareId: 's' })).rejects.toBe(
      stop
    );
    expect(viewAsGuard.assertViewAsAllowed).toHaveBeenCalledWith(
      expect.anything()
    );
    expect(viewAsGuard.assertViewAsAllowed.mock.calls[0]).toHaveLength(1);
  });
});
