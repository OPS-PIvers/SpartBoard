// Unit coverage for the join-code -> session lookup's own logic: the union of
// the pointer path and the transitional legacy query, and what happens when one
// of the two fails. The rules side (who may read and write pointers) is covered
// against the emulator in tests/rules/quizJoinCodeLookup.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDocs = vi.fn<(ref: { path?: string }) => Promise<unknown>>();
const getDoc = vi.fn<(ref: { path?: string }) => Promise<unknown>>();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({
    path: path.join('/'),
  })),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  query: vi.fn((ref: unknown) => ref),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  getDocs: (ref: { path?: string }) => getDocs(ref),
  getDoc: (ref: { path?: string }) => getDoc(ref),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

const { findQuizSessionsByCode, lookupSessionIdsByCode } =
  await import('@/utils/quizJoinCodes');

const pointerSnap = (ids: string[]) => ({ docs: ids.map((id) => ({ id })) });

const sessionSnap = (id: string, data: Record<string, unknown> | null) => ({
  id,
  exists: () => data !== null,
  data: () => data,
});

beforeEach(() => {
  getDocs.mockReset();
  getDoc.mockReset();
});

/** Pointer list first, then the legacy where('code') query. */
function wireQueries(
  pointerIds: string[] | Error,
  legacyIds: string[] | Error
) {
  getDocs.mockImplementation((ref: { path?: string }) => {
    const isPointer = (ref?.path ?? '').startsWith('quiz_join_codes');
    const outcome = isPointer ? pointerIds : legacyIds;
    if (outcome instanceof Error) return Promise.reject(outcome);
    return Promise.resolve(
      isPointer
        ? pointerSnap(outcome)
        : {
            docs: outcome.map((id) => ({
              id,
              data: () => ({ code: 'ABC123' }),
            })),
          }
    );
  });
  getDoc.mockImplementation((ref: { path?: string }) => {
    const id = (ref?.path ?? '').split('/').pop() ?? '';
    return Promise.resolve(sessionSnap(id, { code: 'ABC123' }));
  });
}

describe('lookupSessionIdsByCode', () => {
  it('returns nothing for an empty code without touching Firestore', async () => {
    await expect(lookupSessionIdsByCode('')).resolves.toEqual([]);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('returns the pointer doc ids', async () => {
    wireQueries(['s2', 's1'], []);
    await expect(lookupSessionIdsByCode('ABC123')).resolves.toEqual([
      's2',
      's1',
    ]);
  });
});

describe('findQuizSessionsByCode', () => {
  it('resolves a pointer to its session document', async () => {
    wireQueries(['s1'], []);
    const out = await findQuizSessionsByCode('ABC123');
    expect(out.map((m) => m.id)).toEqual(['s1']);
  });

  it('skips a pointer whose session no longer exists', async () => {
    wireQueries(['s1', 'gone'], []);
    getDoc.mockImplementation((ref: { path?: string }) => {
      const id = (ref?.path ?? '').split('/').pop() ?? '';
      return Promise.resolve(
        sessionSnap(id, id === 'gone' ? null : { code: 'ABC123' })
      );
    });
    const out = await findQuizSessionsByCode('ABC123');
    expect(out.map((m) => m.id)).toEqual(['s1']);
  });

  // Sessions created before the pointer collection shipped are reachable only
  // through the legacy query, so both have to be searched until the backfill runs.
  it('unions the legacy query with the pointers, pointers first', async () => {
    wireQueries(['s1'], ['s-legacy']);
    const out = await findQuizSessionsByCode('ABC123');
    expect(out.map((m) => m.id)).toEqual(['s1', 's-legacy']);
  });

  it('reports a session found by both paths once', async () => {
    wireQueries(['s1'], ['s1']);
    const out = await findQuizSessionsByCode('ABC123');
    expect(out.map((m) => m.id)).toEqual(['s1']);
  });

  it('still answers when the pointer lookup fails', async () => {
    wireQueries(new Error('permission-denied'), ['s-legacy']);
    const out = await findQuizSessionsByCode('ABC123');
    expect(out.map((m) => m.id)).toEqual(['s-legacy']);
  });

  it('still answers when the legacy query fails', async () => {
    wireQueries(['s1'], new Error('permission-denied'));
    const out = await findQuizSessionsByCode('ABC123');
    expect(out.map((m) => m.id)).toEqual(['s1']);
  });

  // A student who cannot reach either path must see the error, not an empty
  // join form that looks like a wrong code.
  it('throws when both paths fail', async () => {
    wireQueries(new Error('offline'), new Error('offline'));
    await expect(findQuizSessionsByCode('ABC123')).rejects.toThrow('offline');
  });
});
