import { describe, it, expect, vi, beforeEach } from 'vitest';

type DocData = Record<string, unknown>;

// In-memory Firestore covering exactly what glTours touches.
const h = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const failCreate = new Set<string>();
  const ref = (path: string) => ({
    path,
    id: path.split('/').pop() as string,
    get: () =>
      Promise.resolve({ exists: store.has(path), data: () => store.get(path) }),
    delete: () => Promise.resolve(void store.delete(path)),
    create: (d: DocData) => {
      if (failCreate.has(path)) {
        return Promise.reject(Object.assign(new Error('down'), { code: 14 }));
      }
      if (store.has(path)) {
        return Promise.reject(Object.assign(new Error('exists'), { code: 6 }));
      }
      store.set(path, d);
      return Promise.resolve();
    },
  });
  const collection = (name: string) => {
    const docs = () =>
      [...store.keys()]
        .filter((p) => p.startsWith(`${name}/`) && p.split('/').length === 2)
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
    };
  };
  let txQueue: Promise<unknown> = Promise.resolve();
  type Tx = {
    get: (r: { path: string }) => Promise<unknown>;
    set: (r: { path: string }, d: DocData) => void;
  };
  const runTx = <T>(fn: (tx: Tx) => Promise<T>) =>
    fn({
      get: (r) => {
        const data = store.get(r.path);
        return Promise.resolve({
          exists: data !== undefined,
          get: (field: string) => data?.[field],
        });
      },
      set: (r, d) => void store.set(r.path, d),
    });
  const db = {
    collection,
    batch: () => {
      const ops: (() => void)[] = [];
      const b = {
        set: (r: { path: string }, d: DocData) => {
          ops.push(() => void store.set(r.path, d));
          return b;
        },
        delete: (r: { path: string }) => {
          ops.push(() => void store.delete(r.path));
          return b;
        },
        commit: () => Promise.resolve(ops.forEach((op) => op())),
      };
      return b;
    },
    runTransaction: <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
      const run = txQueue.then(() => runTx(fn));
      txQueue = run.catch(() => undefined);
      return run;
    },
  };
  return { store, failCreate, db };
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
  HttpsError: class extends Error {},
}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

import type * as adminNs from 'firebase-admin';
import {
  buildGlTourContent,
  claimGlToursSeed,
  glTourSnapshots,
  GL_TOURS_LOCK_STALE_MS,
} from './glTours';

type TriggerHandler = (event: {
  params: { setId: string };
  data?: { after: { exists: boolean } };
}) => Promise<void>;
const trigger = glTourSnapshots as unknown as TriggerHandler;

const META = 'building_guided_learning_tours/_meta';
const LOCK = 'building_guided_learning_tours/_lock';
const tour = (id: string) =>
  h.store.get(`building_guided_learning_tours/${id}`);

const tourSet = (over: DocData = {}): DocData => ({
  id: 's1',
  title: 'Boards',
  description: 'How to',
  imageUrls: ['https://i/1.png'],
  imagePaths: ['users/a/hotspot_images/1.png'],
  steps: [{ id: 'a', tour: { anchor: 'sidebar.boards', action: 'click' } }],
  mode: 'guided',
  watchPace: 'calm',
  welcomeEnabled: true,
  welcomeMessage: 'Hi',
  tourSetup: { widgets: ['clock'] },
  createdAt: 1,
  updatedAt: 2,
  isBuilding: true,
  helpCenter: true,
  authorUid: 'u1',
  hasLiveTour: true,
  ...over,
});

beforeEach(() => {
  h.store.clear();
  h.failCreate.clear();
});

describe('buildGlTourContent', () => {
  it('keeps the tour content and drops bookkeeping', () => {
    expect(buildGlTourContent('s1', tourSet())).toEqual({
      id: 's1',
      title: 'Boards',
      imageUrls: ['https://i/1.png'],
      steps: [{ id: 'a', tour: { anchor: 'sidebar.boards', action: 'click' } }],
      mode: 'guided',
      watchPace: 'calm',
      welcomeEnabled: true,
      welcomeMessage: 'Hi',
      tourSetup: { widgets: ['clock'] },
    });
  });
});

describe('one-time publish of existing tours', () => {
  it('publishes every set with a live tour once, then writes the marker', async () => {
    h.store.set('building_guided_learning/live', tourSet({ id: 'live' }));
    h.store.set(
      'building_guided_learning/unstamped',
      tourSet({ id: 'unstamped', hasLiveTour: undefined })
    );
    h.store.set(
      'building_guided_learning/plain',
      tourSet({ id: 'plain', hasLiveTour: false, steps: [{ id: 'x' }] })
    );
    await Promise.all(
      ['live', 'plain'].map((setId) => trigger({ params: { setId } }))
    );
    expect(tour('live')).toMatchObject({
      set: { id: 'live', title: 'Boards', mode: 'guided' },
      publishedBy: 'auto',
    });
    expect(tour('unstamped')).toBeDefined();
    expect(tour('plain')).toBeUndefined();
    expect(typeof h.store.get(META)?.seededAt).toBe('number');
    expect(h.store.has(LOCK)).toBe(false);
  });

  it('never replaces a snapshot an admin already published', async () => {
    h.store.set('building_guided_learning/live', tourSet({ id: 'live' }));
    const mine = { set: { id: 'live', title: 'Mine' }, publishedAt: 9 };
    h.store.set('building_guided_learning_tours/live', mine);
    await trigger({ params: { setId: 'live' } });
    expect(tour('live')).toEqual(mine);
    expect(h.store.has(META)).toBe(true);
  });

  it('leaves the marker unwritten when a publish fails, so a later write retries', async () => {
    h.store.set('building_guided_learning/live', tourSet({ id: 'live' }));
    h.store.set('building_guided_learning/next', tourSet({ id: 'next' }));
    h.failCreate.add('building_guided_learning_tours/live');
    await trigger({ params: { setId: 'live' } });
    expect(tour('next')).toBeDefined();
    expect(h.store.has(META)).toBe(false);
    expect(h.store.has(LOCK)).toBe(false);

    h.failCreate.clear();
    await trigger({ params: { setId: 'live' } });
    expect(tour('live')).toBeDefined();
    expect(h.store.has(META)).toBe(true);
  });

  it('does nothing once the marker exists', async () => {
    h.store.set(META, { seededAt: 1 });
    h.store.set('building_guided_learning/live', tourSet({ id: 'live' }));
    await trigger({ params: { setId: 'live' } });
    expect(tour('live')).toBeUndefined();
  });

  it('respects a fresh lock and reclaims a stale one', async () => {
    const db = h.db as unknown as adminNs.firestore.Firestore;
    const now = 1_000_000_000;
    h.store.set(LOCK, { startedAt: now - 60_000 });
    expect(await claimGlToursSeed(db, now)).toBe(false);
    h.store.set(LOCK, { startedAt: now - GL_TOURS_LOCK_STALE_MS - 1 });
    expect(await claimGlToursSeed(db, now)).toBe(true);
  });
});

describe('glTourSnapshots trigger', () => {
  it('removes the published tour when its set is deleted', async () => {
    h.store.set(META, { seededAt: 1 });
    h.store.set('building_guided_learning_tours/s1', {
      set: {},
      publishedAt: 1,
    });
    await trigger({
      params: { setId: 's1' },
      data: { after: { exists: false } },
    });
    expect(tour('s1')).toBeUndefined();
  });

  it('keeps the published tour when its set is only edited', async () => {
    h.store.set(META, { seededAt: 1 });
    h.store.set('building_guided_learning/s1', tourSet({ title: 'Draft' }));
    h.store.set('building_guided_learning_tours/s1', {
      set: {},
      publishedAt: 1,
    });
    await trigger({
      params: { setId: 's1' },
      data: { after: { exists: true } },
    });
    expect(tour('s1')).toEqual({ set: {}, publishedAt: 1 });
  });

  it('ignores control-doc ids', async () => {
    await trigger({ params: { setId: '_meta' } });
    expect(h.store.has(META)).toBe(false);
  });
});
