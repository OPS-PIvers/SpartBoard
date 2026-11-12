// Unit tests for shareMembershipV1: board and collection link joins and leaves mirror their firestore.rules gates.
import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { delete: () => 'DELETE' },
  }),
}));
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

import type * as admin from './firebaseAdmin';
import {
  lcShapeOk,
  parseShareMembershipAction,
  planBoardJoin,
  planCollectionJoin,
  runShareMembershipAction,
  type Caller,
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
  const run = (db: unknown, c: Caller, a: unknown) =>
    runShareMembershipAction(
      db as admin.firestore.Firestore,
      c,
      parseShareMembershipAction(a),
      7
    );

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
