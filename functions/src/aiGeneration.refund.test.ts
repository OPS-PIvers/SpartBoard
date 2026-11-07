import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(() => ({}), {
    FieldValue: { serverTimestamp: () => 'ts' },
  }),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {},
  onCall: (_o: unknown, handler: unknown) => handler,
}));
vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ value: () => name, name }),
}));
vi.mock('./classlinkShared', () => ({
  ALLOWED_ORIGINS: [],
  normalizeEmailDomain: () => '@x',
  resolveOrgIdForDomain: () => Promise.resolve('o'),
}));

import { refundAiUsage } from './aiGeneration';

function fakeDb(counts: Record<string, number>) {
  const markers = new Set<string>();
  const key = (col: string, id: string) => `${col}/${id}`;
  const db = {
    collection: (col: string) => ({
      doc: (id: string) => ({ col, id }),
    }),
    runTransaction: async (
      fn: (tx: {
        get: (r: { col: string; id: string }) => Promise<unknown>;
        set: (r: { col: string; id: string }, d: { count?: number }) => void;
      }) => Promise<void>
    ) => {
      const writes: (() => void)[] = [];
      await fn({
        get: (r) =>
          Promise.resolve(
            r.col === 'ai_usage_refunds'
              ? { exists: markers.has(r.id) }
              : { exists: true, data: () => ({ count: counts[r.id] }) }
          ),
        set: (r, d) =>
          writes.push(() => {
            if (r.col === 'ai_usage_refunds') markers.add(r.id);
            else counts[r.id] = d.count ?? 0;
          }),
      });
      writes.forEach((w) => w());
    },
  };
  return { db: db as never, key };
}

describe('refundAiUsage', () => {
  it('refunds a charge once however often it is retried', async () => {
    const counts = { a: 3, b: 2 };
    const { db } = fakeDb(counts);
    const charge = { docIds: ['a', 'b'], id: 'c1' };
    await refundAiUsage(db, charge);
    await refundAiUsage(db, charge);
    expect(counts).toEqual({ a: 2, b: 1 });
  });

  it('refunds two different charges separately', async () => {
    const counts = { a: 3 };
    const { db } = fakeDb(counts);
    await refundAiUsage(db, { docIds: ['a'], id: 'c1' });
    await refundAiUsage(db, { docIds: ['a'], id: 'c2' });
    expect(counts.a).toBe(1);
  });

  it('still refunds a charge saved before ids existed', async () => {
    const counts = { a: 3 };
    const { db } = fakeDb(counts);
    await refundAiUsage(db, { docIds: ['a'] });
    expect(counts.a).toBe(2);
  });
});
