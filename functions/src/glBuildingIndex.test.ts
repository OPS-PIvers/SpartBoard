import { describe, it, expect, vi, beforeEach } from 'vitest';

type DocData = Record<string, unknown>;

// In-memory Firestore covering exactly what glBuildingIndex touches.
const h = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const ref = (path: string) => ({
    path,
    id: path.split('/').pop() as string,
    get: () => Promise.resolve({ exists: store.has(path) }),
  });
  const collection = (name: string) => {
    const docs = () =>
      [...store.keys()]
        .filter((p) => p.startsWith(`${name}/`))
        .sort()
        .map((p) => ref(p));
    const query = (after?: string, limit = Infinity) => ({
      limit: (n: number) => query(after, n),
      startAfter: (snap: { id: string }) => query(snap.id, limit),
      get: () => {
        const all = docs().filter((r) => !after || r.id > after);
        const page = all.slice(0, limit).map((r) => ({
          id: r.id,
          data: () => store.get(r.path),
        }));
        return Promise.resolve({ docs: page });
      },
    });
    return {
      doc: (id: string) => ref(`${name}/${id}`),
      orderBy: () => query(),
      listDocuments: () => Promise.resolve(docs()),
    };
  };
  const db = {
    collection,
    runTransaction: async <T>(
      fn: (tx: {
        get: (r: { path: string }) => Promise<unknown>;
        set: (r: { path: string }, d: DocData) => void;
        delete: (r: { path: string }) => void;
      }) => Promise<T>
    ) =>
      fn({
        get: (r) =>
          Promise.resolve({
            exists: store.has(r.path),
            data: () => store.get(r.path),
          }),
        set: (r, d) => void store.set(r.path, d),
        delete: (r) => void store.delete(r.path),
      }),
    bulkWriter: () => ({
      set: (r: { path: string }, d: DocData) =>
        Promise.resolve(void store.set(r.path, d)),
      delete: (r: { path: string }) =>
        Promise.resolve(void store.delete(r.path)),
      close: () => Promise.resolve(),
    }),
  };
  return { store, db };
});

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(
    vi.fn(() => h.db),
    { FieldPath: { documentId: () => '__name__' } }
  ),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_opts: unknown, handler: unknown) => handler),
}));
vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((_opts: unknown, handler: unknown) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

import {
  buildGlBuildingIndexEntry,
  glBuildingIndexMirror,
  rebuildGlBuildingIndexV1,
} from './glBuildingIndex';

type TriggerHandler = (event: { params: { setId: string } }) => Promise<void>;
type CallableHandler = (request: {
  auth?: { uid: string; token: { email?: string; email_verified?: boolean } };
}) => Promise<{ written: number; removed: number; failed: number }>;
const trigger = glBuildingIndexMirror as unknown as TriggerHandler;
const backfill = rebuildGlBuildingIndexV1 as unknown as CallableHandler;

const fullSet = (over: DocData = {}): DocData => ({
  id: 's1',
  title: 'Photosynthesis',
  description: 'Leaves',
  imageUrls: ['https://v/clip.mp4', 'https://i/slide.png'],
  imageKinds: ['video', 'image'],
  imagePaths: ['a/b.png'],
  steps: [{ id: 'x' }, { id: 'y', tour: { anchor: 'dock' } }],
  mode: 'guided',
  createdAt: 100,
  updatedAt: 200,
  isBuilding: true,
  ...over,
});

const index = (id: string) =>
  h.store.get(`building_guided_learning_index/${id}`);

beforeEach(() => {
  h.store.clear();
});

describe('buildGlBuildingIndexEntry', () => {
  it('keeps only library metadata, never steps or media paths', () => {
    expect(buildGlBuildingIndexEntry('s1', fullSet())).toEqual({
      id: 's1',
      title: 'Photosynthesis',
      description: 'Leaves',
      stepCount: 2,
      mode: 'guided',
      thumbnail: 'https://i/slide.png',
      createdAt: 100,
      updatedAt: 200,
      hasLiveTour: true,
      isHelpCenter: false,
      folderId: null,
      order: null,
    });
  });

  it('takes isHelpCenter from the helpCenter flag only', () => {
    expect(
      buildGlBuildingIndexEntry('s1', fullSet({ helpCenter: true }))
        ?.isHelpCenter
    ).toBe(true);
    expect(
      buildGlBuildingIndexEntry('s1', fullSet({ helpCenter: 'yes' }))
        ?.isHelpCenter
    ).toBe(false);
  });

  it('trusts a stamped hasLiveTour over the steps', () => {
    expect(
      buildGlBuildingIndexEntry('s1', fullSet({ hasLiveTour: false }))
        ?.hasLiveTour
    ).toBe(false);
  });

  it('defaults malformed fields and rejects non-objects', () => {
    expect(buildGlBuildingIndexEntry('s1', { mode: 'weird' })).toMatchObject({
      title: '',
      description: null,
      stepCount: 0,
      mode: 'structured',
      thumbnail: '',
      updatedAt: 0,
      hasLiveTour: false,
    });
    expect(buildGlBuildingIndexEntry('s1', undefined)).toBeNull();
  });

  it('carries folderId and order when present', () => {
    expect(
      buildGlBuildingIndexEntry('s1', fullSet({ folderId: 'f1', order: 3 }))
    ).toMatchObject({ folderId: 'f1', order: 3 });
  });
});

describe('glBuildingIndexMirror trigger', () => {
  it('creates the index entry when a set is created', async () => {
    h.store.set('building_guided_learning/s1', fullSet());
    await trigger({ params: { setId: 's1' } });
    expect(index('s1')).toMatchObject({
      title: 'Photosynthesis',
      stepCount: 2,
    });
  });

  it('replaces the entry on update', async () => {
    h.store.set('building_guided_learning/s1', fullSet());
    await trigger({ params: { setId: 's1' } });
    h.store.set(
      'building_guided_learning/s1',
      fullSet({ title: 'Renamed', steps: [], updatedAt: 300, helpCenter: true })
    );
    await trigger({ params: { setId: 's1' } });
    expect(index('s1')).toMatchObject({
      title: 'Renamed',
      stepCount: 0,
      updatedAt: 300,
      isHelpCenter: true,
    });
  });

  it('removes the entry when the set is deleted', async () => {
    h.store.set('building_guided_learning_index/s1', { id: 's1' });
    await trigger({ params: { setId: 's1' } });
    expect(index('s1')).toBeUndefined();
  });

  it('reads the live set, so a late event cannot restore an old version', async () => {
    h.store.set(
      'building_guided_learning/s1',
      fullSet({ title: 'Newest', updatedAt: 999 })
    );
    await trigger({ params: { setId: 's1' } });
    await trigger({ params: { setId: 's1' } });
    expect(index('s1')).toMatchObject({ title: 'Newest', updatedAt: 999 });
  });
});

describe('rebuildGlBuildingIndexV1 backfill', () => {
  const admin = {
    uid: 'a1',
    token: { email: 'Admin@Orono.k12.mn.us', email_verified: true },
  };

  it('refuses signed-out callers and non-admins', async () => {
    await expect(backfill({})).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(
      backfill({
        auth: { uid: 't1', token: { email: 't@x.org', email_verified: true } },
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses an admin email that is not verified', async () => {
    h.store.set('admins/admin@orono.k12.mn.us', {});
    await expect(
      backfill({
        auth: { uid: 'a1', token: { ...admin.token, email_verified: false } },
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('indexes every set across pages and drops orphaned entries', async () => {
    h.store.set('admins/admin@orono.k12.mn.us', {});
    for (let i = 0; i < 205; i++) {
      const id = `s${String(i).padStart(3, '0')}`;
      h.store.set(`building_guided_learning/${id}`, fullSet({ id }));
    }
    h.store.set('building_guided_learning_index/gone', { id: 'gone' });

    const result = await backfill({ auth: admin });

    expect(result).toEqual({ written: 205, removed: 1, failed: 0 });
    expect(index('s000')).toMatchObject({ title: 'Photosynthesis' });
    expect(index('s204')).toMatchObject({ stepCount: 2 });
    expect(index('gone')).toBeUndefined();
    expect(h.store.get('building_guided_learning/s000')?.steps).toHaveLength(2);
  });
});
