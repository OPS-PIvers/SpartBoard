import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const deleted: string[] = [];
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => {
        const path = `${name}/${id}`;
        return {
          get: () =>
            Promise.resolve({
              exists: store.has(path),
              get: (field: string) => store.get(path)?.[field],
            }),
          delete: () => Promise.resolve(void store.delete(path)),
        };
      },
    }),
  };
  return { store, deleted, db };
});

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(() => h.db),
  storage: vi.fn(() => ({
    bucket: () => ({
      deleteFiles: ({ prefix }: { prefix: string }) =>
        Promise.resolve(void h.deleted.push(prefix)),
    }),
  })),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentDeleted: vi.fn((_opts: unknown, handler: unknown) => handler),
  onDocumentWritten: vi.fn(),
}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

import { webTourCleanup } from './webTours';

type TriggerHandler = (event: { params: { setId: string } }) => Promise<void>;
const trigger = webTourCleanup as unknown as TriggerHandler;
const SNAP = 'building_guided_learning_tours';

beforeEach(() => {
  h.store.clear();
  h.deleted.length = 0;
});

describe('webTourCleanup', () => {
  it('deletes the web snapshot and the picture folder when the draft is deleted', async () => {
    h.store.set(`${SNAP}/w1`, { surface: 'web', set: {} });
    await trigger({ params: { setId: 'w1' } });
    expect(h.store.has(`${SNAP}/w1`)).toBe(false);
    expect(h.deleted).toEqual(['web_tour_pictures/w1/']);
  });

  it('never deletes a SpartBoard snapshot that shares the id', async () => {
    h.store.set(`${SNAP}/s1`, { set: {} });
    await trigger({ params: { setId: 's1' } });
    expect(h.store.has(`${SNAP}/s1`)).toBe(true);
    expect(h.deleted).toEqual(['web_tour_pictures/s1/']);
  });

  it('does nothing when the draft was re-created before the trigger ran', async () => {
    h.store.set(`${SNAP}/w1`, { surface: 'web', set: {} });
    h.store.set('building_web_tours/w1', { title: 'again' });
    await trigger({ params: { setId: 'w1' } });
    expect(h.store.has(`${SNAP}/w1`)).toBe(true);
    expect(h.deleted).toEqual([]);
  });
});
