import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: vi.fn() },
  }),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: () => Promise<void>) => handler,
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import * as admin from './firebaseAdmin';
import { migrateLegacyProjectOverrides } from './projectGradeOverrides';
import { handleStudentDocWrite } from './gradebook/gradeIndexTriggers';
import { makeStubFirestore } from './testing/stubFirestore';

type Db = Parameters<typeof migrateLegacyProjectOverrides>[0];

const GRADE = 'project_runs/run1/grades/g1';
const legacyGrade = {
  points: 8,
  maxPoints: 10,
  released: true,
  gradedAt: 5,
  overridesByUid: { s1: { points: 10, note: 'great' }, 'a/b': { points: 1 } },
};

describe('migrateLegacyProjectOverrides', () => {
  it('moves the map into per-member docs and strips it from the grade', async () => {
    const stub = makeStubFirestore({ [GRADE]: legacyGrade });
    const moved = await migrateLegacyProjectOverrides(
      stub.db as unknown as Db,
      'run1',
      'g1',
      legacyGrade
    );
    expect(moved).toBe(true);
    expect(stub.get(GRADE)).toEqual({
      points: 8,
      maxPoints: 10,
      released: true,
      gradedAt: 5,
    });
    expect(stub.get(`${GRADE}/overrides/s1`)).toEqual({
      points: 10,
      note: 'great',
    });
  });

  it('lets the legacy map win over an existing override doc', async () => {
    const stub = makeStubFirestore({
      [GRADE]: legacyGrade,
      [`${GRADE}/overrides/s1`]: { points: 3 },
      [`${GRADE}/overrides/s2`]: { points: 4 },
    });
    await migrateLegacyProjectOverrides(
      stub.db as unknown as Db,
      'run1',
      'g1',
      legacyGrade
    );
    expect(stub.get(`${GRADE}/overrides/s1`)?.points).toBe(10);
    expect(stub.get(`${GRADE}/overrides/s2`)?.points).toBe(4);
  });

  it('does nothing for a grade without a legacy map', async () => {
    const plain = { points: 8, maxPoints: 10, released: true, gradedAt: 5 };
    const stub = makeStubFirestore({ [GRADE]: plain });
    expect(
      await migrateLegacyProjectOverrides(
        stub.db as unknown as Db,
        'run1',
        'g1',
        plain
      )
    ).toBe(false);
    expect(stub.writes).toEqual([]);
  });

  it('migrates from the grade trigger even with the grade index off', async () => {
    const stub = makeStubFirestore({ [GRADE]: legacyGrade });
    vi.mocked(admin.firestore).mockReturnValue(stub.db as never);
    await handleStudentDocWrite('projects', {
      params: { sessionId: 'run1', docId: 'g1' },
      data: {
        before: { exists: false, data: () => undefined },
        after: { exists: true, data: () => legacyGrade },
      },
    });
    expect(stub.get(GRADE)?.overridesByUid).toBeUndefined();
    expect(stub.get(`${GRADE}/overrides/s1`)?.points).toBe(10);
  });
});
