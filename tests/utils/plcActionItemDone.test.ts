import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';
import type { PlcActionItem } from '@/types';
import {
  decodeUpdate,
  encodeDocSnapshot,
  readNoteContent,
  seedNoteDoc,
} from '@/utils/plcNoteCrdt';

type Ref = { path: string };
const store = new Map<string, Record<string, unknown>>();
const updateCalls: { path: string; fields: Record<string, unknown> }[] = [];
const setCalls: { path: string; data: Record<string, unknown> }[] = [];
let autoId = 0;

const snap = (path: string) => ({
  exists: () => store.has(path),
  data: () => store.get(path),
});
const applyUpdate = (path: string, fields: Record<string, unknown>) => {
  updateCalls.push({ path, fields });
  store.set(path, { ...store.get(path), ...fields });
};

vi.mock('firebase/firestore', () => ({
  doc: (base: unknown, ...segments: string[]) => {
    if (base && typeof base === 'object' && 'path' in base) {
      const id = segments[0] ?? `auto${++autoId}`;
      return { path: `${(base as Ref).path}/${id}` };
    }
    return { path: segments.join('/') };
  },
  collection: (_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  }),
  query: (ref: Ref) => ref,
  orderBy: vi.fn(),
  getDoc: (ref: Ref) => Promise.resolve(snap(ref.path)),
  getDocs: (ref: Ref) => {
    const docs = [...store.entries()]
      .filter(([p]) => p.startsWith(`${ref.path}/`))
      .map(([, data]) => ({ data: () => data }));
    return Promise.resolve({
      forEach: (fn: (d: unknown) => void) => docs.forEach(fn),
    });
  },
  updateDoc: (ref: Ref, fields: Record<string, unknown>) => {
    applyUpdate(ref.path, fields);
    return Promise.resolve();
  },
  setDoc: (ref: Ref, data: Record<string, unknown>) => {
    setCalls.push({ path: ref.path, data });
    store.set(ref.path, data);
    return Promise.resolve();
  },
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: async (
    _db: unknown,
    fn: (tx: {
      get: (ref: Ref) => Promise<unknown>;
      update: (ref: Ref, fields: Record<string, unknown>) => void;
    }) => Promise<void>
  ) =>
    fn({
      get: (ref) => Promise.resolve(snap(ref.path)),
      update: (ref, fields) => applyUpdate(ref.path, fields),
    }),
  serverTimestamp: () => 'SERVER_TS',
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ user: null }) }));
const logErrorMock = vi.fn<(...args: unknown[]) => void>();
vi.mock('@/utils/logError', () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
}));

const { applyActionItemDoneChanges } =
  await import('@/utils/plcActionItemDone');

const item = (id: string, done = false): PlcActionItem => ({
  id,
  text: `Item ${id}`,
  done,
  assigneeUid: 'me',
  dueAt: null,
  createdBy: 'me',
  createdAt: 1,
  doneAt: done ? 5 : null,
});

const NOTE = 'plcs/p1/notes/n1';
const DOC = 'plcs/p1/docs/d1';
const NOW = 1000;

const change = (
  itemId: string,
  done: boolean,
  source: 'note' | 'doc' = 'note',
  parentId = source === 'note' ? 'n1' : 'd1'
) => ({ plcId: 'p1', source, parentId, itemId, done });

describe('applyActionItemDoneChanges', () => {
  beforeEach(() => {
    store.clear();
    updateCalls.length = 0;
    setCalls.length = 0;
    logErrorMock.mockReset();
  });

  it('flips a plain note item and bumps the version', async () => {
    store.set(NOTE, {
      title: 'T',
      body: 'B',
      version: 3,
      actionItems: [item('a'), item('b')],
    });

    await applyActionItemDoneChanges([change('a', true)], 'me', {
      collab: false,
      now: NOW,
    });

    expect(updateCalls).toHaveLength(1);
    const { fields } = updateCalls[0];
    expect(fields.version).toBe(4);
    expect(fields.lastEditedBy).toBe('me');
    const items = fields.actionItems as PlcActionItem[];
    expect(items[0]).toMatchObject({ id: 'a', done: true, doneAt: NOW });
    expect(items[1]).toEqual(item('b'));
  });

  it('groups several items on one note into one write', async () => {
    store.set(NOTE, {
      title: 'T',
      body: 'B',
      version: 0,
      actionItems: [item('a'), item('b', true), item('c')],
    });

    await applyActionItemDoneChanges(
      [change('a', true), change('b', false)],
      'me',
      { collab: false, now: NOW }
    );

    expect(updateCalls).toHaveLength(1);
    const items = updateCalls[0].fields.actionItems as PlcActionItem[];
    expect(items.map((i) => [i.done, i.doneAt])).toEqual([
      [true, NOW],
      [false, null],
      [false, null],
    ]);
  });

  it('skips missing items and items already in the target state', async () => {
    store.set(NOTE, {
      title: 'T',
      body: 'B',
      version: 1,
      actionItems: [item('a', true)],
    });
    store.set(DOC, { title: 'D', url: 'u', actionItems: [item('x')] });

    await applyActionItemDoneChanges(
      [change('a', true), change('gone', true), change('x', false, 'doc')],
      'me',
      { collab: false, now: NOW }
    );

    expect(updateCalls).toHaveLength(0);
  });

  it('writes doc action items with updatedAt', async () => {
    store.set(DOC, {
      title: 'D',
      url: 'u',
      actionItems: [item('x'), item('y')],
    });

    await applyActionItemDoneChanges([change('y', true, 'doc')], 'me', {
      collab: false,
      now: NOW,
    });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].path).toBe(DOC);
    expect(updateCalls[0].fields.updatedAt).toBe('SERVER_TS');
    const items = updateCalls[0].fields.actionItems as PlcActionItem[];
    expect(items[1]).toMatchObject({ id: 'y', done: true, doneAt: NOW });
    expect(items[0]).toEqual(item('x'));
  });

  it('routes a collaborative note through a Yjs update and mirrors it', async () => {
    const seed = new Y.Doc();
    seedNoteDoc(seed, {
      title: 'T',
      body: 'Body',
      actionItems: [item('a'), item('b')],
    });
    store.set(NOTE, {
      title: 'T',
      body: 'Body',
      version: 7,
      yState: encodeDocSnapshot(seed),
      actionItems: [item('a'), item('b')],
    });

    await applyActionItemDoneChanges([change('b', true)], 'me', {
      collab: true,
      now: NOW,
    });

    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].path).toMatch(/^plcs\/p1\/notes\/n1\/yUpdates\//);
    expect(Object.keys(setCalls[0].data).sort()).toEqual(['at', 'u', 'uid']);
    expect(setCalls[0].data.uid).toBe('me');

    // The published update alone carries the flip onto the stored snapshot.
    Y.applyUpdate(seed, decodeUpdate(setCalls[0].data.u as string));
    expect(readNoteContent(seed).actionItems[1]).toMatchObject({
      id: 'b',
      done: true,
      doneAt: NOW,
    });

    expect(updateCalls).toHaveLength(1);
    const { fields } = updateCalls[0];
    expect(fields).toMatchObject({ title: 'T', body: 'Body', version: 8 });
    const items = fields.actionItems as PlcActionItem[];
    expect(items[1]).toMatchObject({ id: 'b', done: true, doneAt: NOW });
    expect(items[0]).toMatchObject({ id: 'a', done: false });
  });

  it('logs a failing parent without blocking the others', async () => {
    store.set(DOC, { title: 'D', url: 'u', actionItems: [item('x')] });
    store.set(NOTE, {
      title: 'T',
      body: 'B',
      version: 1,
      actionItems: [item('a')],
      yState: '###not-base64###',
    });

    await applyActionItemDoneChanges(
      [change('a', true), change('x', true, 'doc')],
      'me',
      { collab: true, now: NOW }
    );

    expect(logErrorMock).toHaveBeenCalledTimes(1);
    expect(updateCalls.map((c) => c.path)).toEqual([DOC]);
  });
});
