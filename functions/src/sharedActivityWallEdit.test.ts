// Unit tests for a Synced collaborator editing another member's Activity Wall.
import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
}));

vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    onCall: (_opts: unknown, handler: unknown) => handler,
    HttpsError: FakeHttpsError,
  };
});
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));

import {
  handleSaveSharedActivityWall,
  type SharedWallEditCaller,
  type SharedWallEditDeps,
} from './sharedActivityWallEdit';

type Doc = Record<string, unknown>;
const STUDENT_EMAIL = '704522@orono.k12.mn.us';

function makeDeps(docs: Record<string, Doc>): SharedWallEditDeps {
  const apply = (path: string, data: Doc) => {
    const next = { ...(docs[path] ?? {}), ...data };
    docs[path] = next;
  };
  const docRef = (path: string) => ({
    path,
    collection: (sub: string) => ({
      doc: (id: string) => docRef(`${path}/${sub}/${id}`),
    }),
  });
  type Ref = ReturnType<typeof docRef>;
  const db = {
    collection: (c: string) => ({ doc: (id: string) => docRef(`${c}/${id}`) }),
    runTransaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: (ref: Ref) =>
          Promise.resolve({
            exists: docs[ref.path] !== undefined,
            data: () => docs[ref.path],
          }),
        update: (ref: Ref, d: Doc) => apply(ref.path, d),
        set: (ref: Ref, d: Doc) => apply(ref.path, d),
      }),
  };
  return {
    db: db as unknown as SharedWallEditDeps['db'],
    now: () => 1000,
    // A student's own Google account shares the domain but holds no staff member doc.
    isStaff: (email: string) => Promise.resolve(email !== STUDENT_EMAIL),
  };
}

const SHARE = 'shared_boards/share-1';
const SESSION = 'activity_wall_sessions/owner-1_wall-1';
const ACCESS = `${SESSION}/boardAccess/boards`;
const ENTRY = 'users/owner-1/activity_wall_activities/wall-1';

const caller = (
  over: Partial<SharedWallEditCaller> = {}
): SharedWallEditCaller => ({
  uid: 'colleague-1',
  email: 'colleague@orono.k12.mn.us',
  emailVerified: true,
  studentRole: false,
  anonymous: false,
  ...over,
});

function seed(
  over: { share?: Doc; session?: Doc; access?: Doc; entry?: Doc } = {}
) {
  return {
    [SHARE]: {
      originalAuthor: 'owner-1',
      intendedMode: 'synced',
      participants: {
        'colleague-1': { role: 'collaborator' },
        'viewer-1': { role: 'viewer' },
      },
      ...over.share,
    },
    [ACCESS]: { boardShareIds: ['share-1/owner-1'], ...over.access },
    [SESSION]: {
      classIds: ['class-a'],
      classId: 'class-a',
      title: 'Old',
      ...over.session,
    },
    [ENTRY]: {
      id: 'wall-1',
      title: 'Old',
      createdAt: 5,
      classIds: ['class-a'],
      classId: 'class-a',
      rosterIds: ['r1'],
      ...over.entry,
    },
  } as Record<string, Doc>;
}

const input = (over: Doc = {}): Doc => ({
  shareId: 'share-1',
  ownerUid: 'owner-1',
  activityId: 'wall-1',
  changes: { title: 'New title', allowGuests: true },
  ...over,
});

const expectCode = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toMatchObject({ code });
};

describe('handleSaveSharedActivityWall', () => {
  it('saves a collaborator edit into the owner library and session', async () => {
    const docs = seed();
    await handleSaveSharedActivityWall(makeDeps(docs), caller(), input());
    expect(docs[ENTRY]).toMatchObject({
      title: 'New title',
      allowGuests: true,
      createdAt: 5,
      rosterIds: ['r1'],
      updatedAt: 1000,
    });
    expect(docs[SESSION]).toMatchObject({
      title: 'New title',
      allowGuests: true,
      driveVisibility: 'anyone',
    });
    expect(docs[ACCESS]).toEqual({ boardShareIds: ['share-1/owner-1'] });
  });

  it("keeps the colleague's classes beside the owner's", async () => {
    const docs = seed({
      entry: { memberClassIds: { 'other-teacher': ['class-o'] } },
    });
    const result = await handleSaveSharedActivityWall(
      makeDeps(docs),
      caller(),
      input({ changes: {}, myClassIds: ['class-c', 'class-a'] })
    );
    expect(result.classIds).toEqual(['class-a', 'class-o', 'class-c']);
    expect(docs[ENTRY].classIds).toEqual(['class-a']);
    expect(docs[ENTRY].memberClassIds).toEqual({
      'other-teacher': ['class-o'],
      'colleague-1': ['class-c', 'class-a'],
    });
    expect(docs[SESSION].classIds).toEqual(['class-a', 'class-o', 'class-c']);
    expect(docs[SESSION].classId).toBe('class-a');
  });

  it("clearing the colleague's classes never touches the owner's", async () => {
    const docs = seed({
      entry: { memberClassIds: { 'colleague-1': ['class-c'] } },
    });
    await handleSaveSharedActivityWall(
      makeDeps(docs),
      caller(),
      input({ changes: {}, myClassIds: [] })
    );
    expect(docs[ENTRY].classIds).toEqual(['class-a']);
    expect(docs[ENTRY].memberClassIds).toEqual({});
    expect(docs[SESSION].classIds).toEqual(['class-a']);
  });

  it('keeps a link-only wall link-only', async () => {
    const docs = seed({ entry: { classIds: [], classId: undefined } });
    delete docs[ENTRY].classId;
    await expectCode(
      handleSaveSharedActivityWall(
        makeDeps(docs),
        caller(),
        input({ changes: {}, myClassIds: ['class-c'] })
      ),
      'failed-precondition'
    );
    expect(docs[ENTRY].memberClassIds).toBeUndefined();
  });

  it('wraps a longitude from a repeated world copy', async () => {
    const docs = seed();
    await handleSaveSharedActivityWall(
      makeDeps(docs),
      caller(),
      input({ changes: { mapCenter: { lat: 10, lng: 205, zoom: 3 } } })
    );
    expect(docs[ENTRY].mapCenter).toEqual({ lat: 10, lng: -155, zoom: 3 });
  });

  it('lets the board host edit a collaborator wall', async () => {
    const docs = seed({
      share: {
        originalAuthor: 'colleague-1',
        participants: { 'owner-1': { role: 'collaborator' } },
      },
      access: { boardShareIds: ['share-1/colleague-1'] },
    });
    await handleSaveSharedActivityWall(makeDeps(docs), caller(), input());
    expect(docs[ENTRY].title).toBe('New title');
  });

  it('turns off dated timelines when the layout leaves timeline', async () => {
    const docs = seed({ session: { timelineDates: true } });
    await handleSaveSharedActivityWall(
      makeDeps(docs),
      caller(),
      input({ changes: { layout: 'wall' } })
    );
    expect(docs[SESSION].timelineDates).toBe(false);
  });

  it('denies viewers, outsiders and non-district accounts', async () => {
    await expectCode(
      handleSaveSharedActivityWall(
        makeDeps(seed()),
        caller({ uid: 'viewer-1' }),
        input()
      ),
      'permission-denied'
    );
    await expectCode(
      handleSaveSharedActivityWall(
        makeDeps(seed()),
        caller({ uid: 'stranger' }),
        input()
      ),
      'permission-denied'
    );
    await expectCode(
      handleSaveSharedActivityWall(
        makeDeps(seed()),
        caller({ email: 'a@gmail.com' }),
        input()
      ),
      'permission-denied'
    );
    await expectCode(
      handleSaveSharedActivityWall(
        makeDeps(seed()),
        caller({ email: STUDENT_EMAIL }),
        input()
      ),
      'permission-denied'
    );
    await expectCode(
      handleSaveSharedActivityWall(
        makeDeps(seed()),
        caller({ emailVerified: false }),
        input()
      ),
      'permission-denied'
    );
    await expectCode(
      handleSaveSharedActivityWall(
        makeDeps(seed()),
        caller({ studentRole: true }),
        input()
      ),
      'permission-denied'
    );
    await expectCode(
      handleSaveSharedActivityWall(
        makeDeps(seed()),
        caller({ anonymous: true }),
        input()
      ),
      'permission-denied'
    );
    await expectCode(
      handleSaveSharedActivityWall(makeDeps(seed()), null, input()),
      'unauthenticated'
    );
  });

  it('denies when the wall is not opened to this board', async () => {
    const docs = seed({ access: { boardShareIds: ['other-share'] } });
    await expectCode(
      handleSaveSharedActivityWall(makeDeps(docs), caller(), input()),
      'permission-denied'
    );
    expect(docs[ENTRY].title).toBe('Old');
  });

  it('denies an entry pinned to another host, as after a share id is re-created', async () => {
    for (const ids of [['share-1/someone-else'], ['share-1']]) {
      const docs = seed({ access: { boardShareIds: ids } });
      await expectCode(
        handleSaveSharedActivityWall(makeDeps(docs), caller(), input()),
        'permission-denied'
      );
    }
  });

  it('denies when the owner never opened the wall to any board', async () => {
    const docs = seed();
    delete docs[ACCESS];
    await expectCode(
      handleSaveSharedActivityWall(makeDeps(docs), caller(), input()),
      'permission-denied'
    );
  });

  it('denies when the owner is not on the board', async () => {
    const docs = seed({
      share: {
        originalAuthor: 'someone-else',
        participants: { 'colleague-1': { role: 'collaborator' } },
      },
    });
    await expectCode(
      handleSaveSharedActivityWall(makeDeps(docs), caller(), input()),
      'permission-denied'
    );
  });

  it('denies substitute, copy, View-Only and deleted shares', async () => {
    await expectCode(
      handleSaveSharedActivityWall(
        makeDeps(seed({ share: { intendedMode: 'substitute' } })),
        caller(),
        input()
      ),
      'permission-denied'
    );
    await expectCode(
      handleSaveSharedActivityWall(
        makeDeps(seed({ share: { intendedMode: 'copy' } })),
        caller(),
        input()
      ),
      'permission-denied'
    );
    // A View-Only share has no collaborators; even its host can't edit a member's wall here.
    await expectCode(
      handleSaveSharedActivityWall(
        makeDeps(
          seed({
            share: {
              intendedMode: 'view-only',
              originalAuthor: 'colleague-1',
              participants: { 'owner-1': { role: 'viewer' } },
            },
          })
        ),
        caller(),
        input()
      ),
      'permission-denied'
    );
    const docs = seed();
    delete docs[SHARE];
    await expectCode(
      handleSaveSharedActivityWall(makeDeps(docs), caller(), input()),
      'not-found'
    );
  });

  it('accepts the preset backgrounds and image urls', async () => {
    for (const appearance of [
      {
        kind: 'gradient',
        value: 'bg-gradient-to-br from-slate-900 to-slate-700',
      },
      {
        kind: 'color',
        value:
          'bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] bg-slate-100',
      },
      { kind: 'image', value: 'https://storage.example.com/bg.jpg' },
      {
        kind: 'image',
        value:
          "https://firebasestorage.googleapis.com/v0/b/x/o/admin_backgrounds%2Fa%2FFall%20(1)%20teacher's.jpg?alt=media",
      },
      { kind: 'image', value: '/backgrounds/fall.jpg' },
    ]) {
      const docs = seed();
      await handleSaveSharedActivityWall(
        makeDeps(docs),
        caller(),
        input({ changes: { appearance } })
      );
      expect(docs[ENTRY].appearance).toEqual(appearance);
    }
  });

  it('rejects fields the editor does not own and malformed values', async () => {
    const bad = [
      { createdAt: 1 },
      { teacherUid: 'colleague-1' },
      { boardShareIds: [] },
      { rosterIds: ['x'] },
      { classIds: ['x'] },
      { layout: 'grid' },
      { maxPostsPerStudent: -1 },
      { allowedTypes: { script: true } },
      { sections: [{ id: 'a/b', label: 'x' }] },
      { title: 'x'.repeat(301) },
      { memberClassIds: {} },
      { appearance: { kind: 'color', value: 'fixed inset-0 z-50' } },
      { appearance: { kind: 'gradient', value: 'bg-white fixed' } },
      { appearance: { kind: 'image', value: 'javascript:alert(1)' } },
      { appearance: { kind: 'image', value: 'http://example.com/a.jpg' } },
      { appearance: { kind: 'image', value: 'https://a.com/x".jpg' } },
      { mapCenter: { lat: 91, lng: 0, zoom: 3 } },
      { mapCenter: { lat: 0, lng: 0, zoom: 99 } },
    ];
    for (const changes of bad) {
      await expectCode(
        handleSaveSharedActivityWall(
          makeDeps(seed()),
          caller(),
          input({ changes })
        ),
        'invalid-argument'
      );
    }
  });

  it('refuses the owner editing through this path', async () => {
    await expectCode(
      handleSaveSharedActivityWall(
        makeDeps(seed()),
        caller({ uid: 'owner-1' }),
        input()
      ),
      'failed-precondition'
    );
  });
});
