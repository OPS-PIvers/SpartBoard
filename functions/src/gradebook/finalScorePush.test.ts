import { describe, it, expect, vi } from 'vitest';

vi.mock('../firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: vi.fn() },
  }),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { finalScorePushPlan, readOwnedPushSession } from './finalScorePush';
import { finalToolColumnGrades } from '../lti/toolColumnEndpoints';
import { makeStubFirestore, type StubData } from '../testing/stubFirestore';
import type { IndexRow } from './types';

type Db = Parameters<typeof finalScorePushPlan>[0];

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

const row = (uid: string, over: Partial<IndexRow> = {}): IndexRow => ({
  kind: 'quiz',
  sessionId: 's1',
  assignmentId: 's1',
  studentUid: uid,
  ownerUid: 't1',
  editorUids: [],
  rosterIds: ['r1'],
  classIds: ['c1'],
  classId: 'c1',
  rosterId: 'r1',
  title: 'Quiz',
  rawPct: 80,
  points: 8,
  max: 10,
  state: 'scored',
  submittedAt: NOW - 2 * DAY,
  dueAt: NOW - DAY,
  openAt: null,
  closeAt: null,
  createdAt: NOW - 3 * DAY,
  attempts: [{ n: 1, at: NOW - 2 * DAY, points: 8, max: 10, state: 'scored' }],
  targetEvidence: [],
  published: true,
  assigned: true,
  schemaVersion: 1,
  updatedAt: NOW,
  ...over,
});

const mark = (uid: string, over: StubData = {}): StubData => ({
  kind: 'quiz',
  sessionId: 's1',
  studentUid: uid,
  ownerUid: 't1',
  editorUids: [],
  rosterIds: ['r1'],
  flags: [],
  suppressedAuto: [],
  updatedAt: NOW,
  ...over,
});

const seed = (extra: Record<string, StubData> = {}) => ({
  'grade_index/quiz__s1__raw': row('raw') as unknown as StubData,
  'grade_index/quiz__s1__over': row('over') as unknown as StubData,
  'grade_index/quiz__s1__exc': row('exc') as unknown as StubData,
  'grade_index/quiz__s1__wait': row('wait', {
    state: 'awaiting-grade',
    rawPct: null,
    points: null,
  }) as unknown as StubData,
  'grade_index/quiz__s1__none': row('none', {
    state: 'not-attempted',
    rawPct: null,
    points: null,
    submittedAt: null,
    attempts: [],
  }) as unknown as StubData,
  'grade_index/quiz__s1__other': row('other', {
    ownerUid: 't2',
  }) as unknown as StubData,
  'grade_index/quiz__s1__gone': row('gone', {
    classId: 'c9',
  }) as unknown as StubData,
  'gradebook_marks/s1__over': mark('over', { override: { points: 5, at: 1 } }),
  'gradebook_marks/s1__exc': mark('exc', { flags: ['excused'] }),
  'gradebook_marks/s1__solo': mark('solo', { override: { points: 9, at: 1 } }),
  'gradebook_marks/s1__gone': mark('gone', { override: { points: 7, at: 1 } }),
  'gradebook_marks/s1__theirs': mark('theirs', {
    ownerUid: 't2',
    override: { points: 10, at: 1 },
  }),
  ...extra,
});

const session = {
  teacherUid: 't1',
  classIds: ['c1'],
  removedClasses: { classIds: ['c9'] },
};

const run = async (
  extra: Record<string, StubData> = {},
  maxPoints: number | null = 20
) => {
  const stub = makeStubFirestore(seed(extra));
  const refresh = vi.fn(() => Promise.resolve());
  const result = await finalScorePushPlan(
    stub.db as unknown as Db,
    {
      kind: 'quiz',
      sessionId: 's1',
      ownerUid: 't1',
      maxPoints,
      session,
      now: NOW,
    },
    { refresh }
  );
  return { result, refresh };
};

const pointsByUid = (
  entries: { pseudonymUid: string; pointsEarned: number }[]
) => Object.fromEntries(entries.map((e) => [e.pseudonymUid, e.pointsEarned]));

describe('finalScorePushPlan', () => {
  it('sends the gradebook final score on the LMS scale', async () => {
    const { result, refresh } = await run();
    expect(refresh).toHaveBeenCalledWith(expect.anything(), 'quiz', 's1');
    expect(pointsByUid(result.plan.entries)).toEqual({
      raw: 16,
      over: 10,
      solo: 18,
    });
    expect(result.plan.awaiting).toBe(1);
    expect(result.plan.excluded).toBe(1);
    // Past due with nothing turned in: Missing, never a pushed 0.
    expect(result.plan.missing).toEqual(['none']);
  });

  it("ignores another teacher's rows and marks and classes taken off the assignment", async () => {
    const { result } = await run();
    const uids = result.plan.entries.map((e) => e.pseudonymUid);
    expect(uids).not.toContain('other');
    expect(uids).not.toContain('theirs');
    expect(uids).not.toContain('gone');
    expect(result.studentUids).not.toContain('gone');
  });

  it('limits a gradebook push to the class it shows', async () => {
    const stub = makeStubFirestore(seed());
    const result = await finalScorePushPlan(
      stub.db as unknown as Db,
      {
        kind: 'quiz',
        sessionId: 's1',
        ownerUid: 't1',
        maxPoints: 10,
        session,
        scopeUids: ['raw', 'solo'],
        now: NOW,
      },
      { refresh: () => Promise.resolve() }
    );
    expect(pointsByUid(result.plan.entries)).toEqual({ raw: 8, solo: 9 });
    expect(result.plan.awaiting).toBe(0);
    expect(result.plan.missing).toEqual([]);
  });

  it('uses the column Out of for Schoology when no scale is given', async () => {
    const { result } = await run(
      {
        'gradebook_columns/s1': {
          kind: 'quiz',
          sessionId: 's1',
          ownerUid: 't1',
          maxPointsOverride: 50,
        },
      },
      null
    );
    expect(result.maxPoints).toBe(50);
    expect(pointsByUid(result.plan.entries).raw).toBe(40);
  });

  it('falls back to the largest row total for Schoology', async () => {
    const { result } = await run({}, null);
    expect(result.maxPoints).toBe(10);
    expect(pointsByUid(result.plan.entries).over).toBe(5);
  });

  it('still pushes what the index holds when the refresh fails', async () => {
    const stub = makeStubFirestore(seed());
    const result = await finalScorePushPlan(
      stub.db as unknown as Db,
      {
        kind: 'quiz',
        sessionId: 's1',
        ownerUid: 't1',
        maxPoints: 10,
        session,
        now: NOW,
      },
      { refresh: () => Promise.reject(new Error('boom')) }
    );
    expect(pointsByUid(result.plan.entries).raw).toBe(8);
  });
});

describe('readOwnedPushSession', () => {
  it("returns only the caller's own session", async () => {
    const stub = makeStubFirestore({
      'quiz_sessions/s1': { teacherUid: 't1' },
    });
    const db = stub.db as unknown as Db;
    expect(await readOwnedPushSession(db, 'quiz', 's1', 't1')).toEqual({
      teacherUid: 't1',
    });
    expect(await readOwnedPushSession(db, 'quiz', 's1', 't2')).toBeNull();
    expect(await readOwnedPushSession(db, 'va', 's1', 't1')).toBeNull();
    expect(await readOwnedPushSession(db, 'quiz', 'a/b', 't1')).toBeNull();
  });
});

describe('finalToolColumnGrades', () => {
  const final = {
    plan: {
      entries: [{ pseudonymUid: 'a', pointsEarned: 3 }],
      missing: ['m'],
    },
    studentUids: ['a', 'm', 'busy'],
  };

  it('sends scores only unless Missing is asked for', () => {
    expect(finalToolColumnGrades(final, {})).toEqual([
      { pseudonymUid: 'a', pointsEarned: 3 },
    ]);
  });

  it('adds Missing, and the client list only for students with no work', () => {
    expect(
      finalToolColumnGrades(final, {
        includeMissing: true,
        missingWithoutWork: ['a', 'busy', 'empty'],
      })
    ).toEqual([
      { pseudonymUid: 'a', pointsEarned: 3 },
      { pseudonymUid: 'm', missing: true },
      { pseudonymUid: 'empty', missing: true },
    ]);
  });

  it('limits a Retry to the named students', () => {
    expect(
      finalToolColumnGrades(final, { includeMissing: true, onlyUids: ['m'] })
    ).toEqual([{ pseudonymUid: 'm', missing: true }]);
  });
});
