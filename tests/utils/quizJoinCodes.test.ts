// Unit coverage for the join-code -> session lookup's own logic: pointers resolve
// to sessions, and a code's owner record decides whose sessions count. The rules
// side (who may claim a code and write pointers) is covered against the emulator
// in tests/rules/quizJoinCodeLookup.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDocs = vi.fn<(ref: { path?: string }) => Promise<unknown>>();
const getDoc = vi.fn<(ref: { path?: string }) => Promise<unknown>>();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({
    path: path.join('/'),
  })),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  getDocs: (ref: { path?: string }) => getDocs(ref),
  getDoc: (ref: { path?: string }) => getDoc(ref),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

const { findQuizSessionsByCode, lookupSessionIdsByCode, readJoinCodeOwner } =
  await import('@/utils/quizJoinCodes');

const snap = (id: string, data: Record<string, unknown> | null) => ({
  id,
  exists: () => data !== null,
  data: () => data,
});

beforeEach(() => {
  getDocs.mockReset();
  getDoc.mockReset();
});

/** Pointer ids under the code, each session's teacher, and the code's owner. */
function wire(
  pointerIds: string[] | Error,
  teacherBySession: Record<string, string | null>,
  owner: string | null
) {
  getDocs.mockImplementation(() =>
    pointerIds instanceof Error
      ? Promise.reject(pointerIds)
      : Promise.resolve({ docs: pointerIds.map((id) => ({ id })) })
  );
  getDoc.mockImplementation((ref: { path?: string }) => {
    const parts = (ref?.path ?? '').split('/');
    if (parts[0] === 'quiz_join_codes') {
      return Promise.resolve(
        snap(parts[1], owner === null ? null : { teacherUid: owner })
      );
    }
    const id = parts.pop() ?? '';
    const teacher = teacherBySession[id];
    return Promise.resolve(
      snap(
        id,
        teacher === null ? null : { code: 'ABC123', teacherUid: teacher }
      )
    );
  });
}

describe('lookupSessionIdsByCode', () => {
  it('returns nothing for an empty code without touching Firestore', async () => {
    await expect(lookupSessionIdsByCode('')).resolves.toEqual([]);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('returns the pointer doc ids', async () => {
    wire(['s2', 's1'], {}, null);
    await expect(lookupSessionIdsByCode('ABC123')).resolves.toEqual([
      's2',
      's1',
    ]);
  });
});

describe('readJoinCodeOwner', () => {
  it("returns the owner record's uid", async () => {
    wire([], {}, 't-1');
    await expect(readJoinCodeOwner('ABC123')).resolves.toBe('t-1');
  });

  it('returns null for an unclaimed code', async () => {
    wire([], {}, null);
    await expect(readJoinCodeOwner('ABC123')).resolves.toBeNull();
  });
});

describe('findQuizSessionsByCode', () => {
  it('resolves a pointer to its session document', async () => {
    wire(['s1'], { s1: 't-1' }, 't-1');
    const out = await findQuizSessionsByCode('ABC123');
    expect(out.map((m) => m.id)).toEqual(['s1']);
  });

  it('skips a pointer whose session no longer exists', async () => {
    wire(['s1', 'gone'], { s1: 't-1', gone: null }, 't-1');
    const out = await findQuizSessionsByCode('ABC123');
    expect(out.map((m) => m.id)).toEqual(['s1']);
  });

  // The hijack: another account's session under a held code must never be returned,
  // whatever startedAt it carries, so no caller can pick it.
  it("ignores another account's session under an owned code", async () => {
    wire(['squat', 'real'], { squat: 'attacker', real: 't-1' }, 't-1');
    const out = await findQuizSessionsByCode('ABC123');
    expect(out.map((m) => m.id)).toEqual(['real']);
  });

  it('returns nothing when the named teacher does not own the code', async () => {
    wire(['real'], { real: 't-1' }, 't-1');
    await expect(findQuizSessionsByCode('ABC123', 'attacker')).resolves.toEqual(
      []
    );
  });

  it("keeps the named teacher's sessions on an unclaimed legacy code", async () => {
    wire(['mine', 'other'], { mine: 't-1', other: 't-2' }, null);
    const out = await findQuizSessionsByCode('ABC123', 't-1');
    expect(out.map((m) => m.id)).toEqual(['mine']);
  });

  it('matches nothing on an unclaimed code two teachers share', async () => {
    wire(['a', 'b'], { a: 't-1', b: 'attacker' }, null);
    await expect(findQuizSessionsByCode('ABC123')).resolves.toEqual([]);
  });

  it("returns an unclaimed code's sessions when one teacher holds them", async () => {
    wire(['a', 'b'], { a: 't-1', b: 't-1' }, null);
    const out = await findQuizSessionsByCode('ABC123');
    expect(out.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('never runs a quiz_sessions query', async () => {
    wire(['s1'], { s1: 't-1' }, 't-1');
    await findQuizSessionsByCode('ABC123');
    for (const [ref] of getDocs.mock.calls) {
      expect(ref.path).toMatch(/^quiz_join_codes\//);
    }
  });

  it('throws when the pointer lookup fails', async () => {
    wire(new Error('offline'), {}, 't-1');
    await expect(findQuizSessionsByCode('ABC123')).rejects.toThrow('offline');
  });
});
