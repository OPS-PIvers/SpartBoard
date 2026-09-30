import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin', () => ({
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

import * as admin from 'firebase-admin';
import {
  __resetGradeIndexEnabledCache,
  applyDocWrite,
  docWriteMatters,
  drainDirtySessions,
  markSessionDirty,
  recomputeSession,
} from './gradeIndex';
import {
  buildProjectionEntry,
  configPathFor,
  parseConfig,
  projectRow,
  writeProjectionEntry,
} from './gradeProjection';
import { DEFAULT_CONFIG } from './resolveFinalScore';
import {
  gradeIndexQuizResponse,
  gradeIndexMark,
  gradeIndexQuizSession,
  runGradeIndexRecompute,
} from './gradeIndexTriggers';
import { makeStubFirestore, type StubData } from '../testing/stubFirestore';
import type { GradeIndexRow } from './types';

type Db = Parameters<typeof applyDocWrite>[0];
type Handler = (event: {
  params: Record<string, string>;
  data?: {
    before: { exists: boolean; data: () => StubData | undefined };
    after: { exists: boolean; data: () => StubData | undefined };
  };
}) => Promise<void>;

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

const quizSession: StubData = {
  teacherUid: 't1',
  assignmentId: 'qs1',
  quizTitle: 'Fractions check',
  rosterIds: ['r1'],
  classIds: ['c1'],
  dueAt: NOW - DAY,
  scorePublishedAt: NOW - 10,
  publicQuestions: [{ id: 'q1', type: 'MC', text: 'a', choices: ['A', 'B'] }],
};
const quizKey: StubData = {
  questions: [
    {
      id: 'q1',
      type: 'MC',
      text: 'a',
      correctAnswer: 'A',
      incorrectAnswers: ['B'],
      points: 2,
    },
  ],
};
const completed = (over: StubData = {}): StubData => ({
  studentUid: 'u1',
  status: 'completed',
  classId: 'c1',
  submittedAt: NOW - 2 * DAY,
  completedAttempts: 1,
  answers: [{ questionId: 'q1', answer: 'A' }],
  ...over,
});

function seed(extra: Record<string, StubData> = {}) {
  return makeStubFirestore({
    'admin_settings/gradebook_index': { enabled: true },
    'quiz_sessions/qs1': quizSession,
    'users/t1/quiz_assignments/qs1': { questionSnapshot: [] },
    'users/t1/quiz_assignments/qs1/key/answers': quizKey,
    ...extra,
  });
}

beforeEach(() => __resetGradeIndexEnabledCache());

describe('applyDocWrite', () => {
  it('writes a scored quiz row', async () => {
    const stub = seed({ 'quiz_sessions/qs1/responses/u1': completed() });
    await applyDocWrite(
      stub.db as unknown as Db,
      {
        kind: 'quiz',
        sessionId: 'qs1',
        docId: 'u1',
        before: undefined,
        after: completed(),
      },
      NOW
    );
    expect(stub.get('grade_index/qs1__u1')).toMatchObject({
      kind: 'quiz',
      ownerUid: 't1',
      studentUid: 'u1',
      rosterId: 'r1',
      classId: 'c1',
      rawPct: 100,
      points: 2,
      max: 2,
      state: 'scored',
      published: true,
      assigned: true,
      late: false,
      title: 'Fractions check',
    });
  });

  it('skips anonymous PIN responses', async () => {
    const stub = seed();
    const n = await applyDocWrite(
      stub.db as unknown as Db,
      {
        kind: 'quiz',
        sessionId: 'qs1',
        docId: 'pin-3-1234',
        before: undefined,
        after: completed({ studentUid: 'anon' }),
      },
      NOW
    );
    expect(n).toBe(0);
    expect(stub.has('grade_index/qs1__anon')).toBe(false);
  });

  it('ignores mid-attempt answer saves', () => {
    const before = { status: 'in-progress', answers: [] };
    const after = {
      status: 'in-progress',
      answers: [{ questionId: 'q1', answer: 'B' }],
    };
    expect(
      docWriteMatters({
        kind: 'quiz',
        sessionId: 's',
        docId: 'u',
        before,
        after,
      })
    ).toBe(false);
  });

  it('keeps each attempt across a retake', async () => {
    const stub = seed();
    const db = stub.db as unknown as Db;
    await applyDocWrite(
      db,
      {
        kind: 'quiz',
        sessionId: 'qs1',
        docId: 'u1',
        before: undefined,
        after: completed(),
      },
      NOW
    );
    const retake = completed({ status: 'in-progress', answers: [] });
    await applyDocWrite(
      db,
      {
        kind: 'quiz',
        sessionId: 'qs1',
        docId: 'u1',
        before: completed(),
        after: retake,
      },
      NOW
    );
    const second = completed({
      completedAttempts: 2,
      answers: [{ questionId: 'q1', answer: 'B' }],
    });
    await applyDocWrite(
      db,
      {
        kind: 'quiz',
        sessionId: 'qs1',
        docId: 'u1',
        before: retake,
        after: second,
      },
      NOW
    );
    const row = stub.get('grade_index/qs1__u1') as unknown as GradeIndexRow;
    expect(row.attempts.map((a) => [a.n, a.pct])).toEqual([
      [1, 100],
      [2, 0],
    ]);
  });

  it('marks a student outside individual targeting as not assigned', async () => {
    const stub = seed({
      'quiz_sessions/qs1': { ...quizSession, individualTargeting: true },
      'student_assignments/u2/items/qs1': { dueAt: NOW + DAY },
    });
    const db = stub.db as unknown as Db;
    await applyDocWrite(
      db,
      {
        kind: 'quiz',
        sessionId: 'qs1',
        docId: 'u1',
        before: undefined,
        after: completed(),
      },
      NOW
    );
    await applyDocWrite(
      db,
      {
        kind: 'quiz',
        sessionId: 'qs1',
        docId: 'u2',
        before: undefined,
        after: completed({ studentUid: 'u2' }),
      },
      NOW
    );
    expect(stub.get('grade_index/qs1__u1')).toMatchObject({ assigned: false });
    expect(stub.get('grade_index/qs1__u2')).toMatchObject({
      assigned: true,
      dueAt: NOW + DAY,
    });
  });

  it('deletes the row when the response goes', async () => {
    const stub = seed({
      'grade_index/qs1__u1': { sessionId: 'qs1', studentUid: 'u1' },
    });
    await applyDocWrite(
      stub.db as unknown as Db,
      {
        kind: 'quiz',
        sessionId: 'qs1',
        docId: 'u1',
        before: completed(),
        after: undefined,
      },
      NOW
    );
    expect(stub.has('grade_index/qs1__u1')).toBe(false);
  });

  it('builds one row per project group member', async () => {
    const stub = makeStubFirestore({
      'project_runs/t1_p1': {
        teacherUid: 't1',
        title: 'Bridge build',
        classIds: ['c1'],
      },
      'project_runs/t1_p1/groups/g1': {
        classId: 'c1',
        memberUids: ['u1', 'u2'],
      },
    });
    const grade = {
      points: 16,
      maxPoints: 20,
      released: false,
      overridesByUid: { u2: { points: 20 } },
    };
    await applyDocWrite(
      stub.db as unknown as Db,
      {
        kind: 'projects',
        sessionId: 't1_p1',
        docId: 'g1',
        before: undefined,
        after: grade,
      },
      NOW
    );
    expect(stub.get('grade_index/t1_p1__u1')).toMatchObject({
      kind: 'projects',
      rawPct: 80,
      published: false,
    });
    expect(stub.get('grade_index/t1_p1__u2')).toMatchObject({ rawPct: 100 });
  });

  it('keeps an Activity Wall row until the author has no submissions left', async () => {
    const stub = makeStubFirestore({
      'activity_wall_sessions/t1_w1': {
        teacherUid: 't1',
        title: 'Exit wall',
        classIds: ['c1'],
      },
      'activity_wall_sessions/t1_w1/submissions/a': {
        authorUid: 'u1',
        submittedAt: 5,
      },
      'activity_wall_sessions/t1_w1/submissions/b': {
        authorUid: 'u1',
        submittedAt: 3,
      },
    });
    const db = stub.db as unknown as Db;
    await applyDocWrite(
      db,
      {
        kind: 'activity-wall',
        sessionId: 't1_w1',
        docId: 'a',
        before: undefined,
        after: { authorUid: 'u1', submittedAt: 5 },
      },
      NOW
    );
    expect(stub.get('grade_index/t1_w1__u1')).toMatchObject({
      completionOnly: true,
      submittedAt: 3,
      state: 'scored',
    });
    stub.store.delete('activity_wall_sessions/t1_w1/submissions/a');
    stub.store.delete('activity_wall_sessions/t1_w1/submissions/b');
    await applyDocWrite(
      db,
      {
        kind: 'activity-wall',
        sessionId: 't1_w1',
        docId: 'b',
        before: { authorUid: 'u1', submittedAt: 3 },
        after: undefined,
      },
      NOW
    );
    expect(stub.has('grade_index/t1_w1__u1')).toBe(false);
  });
});

describe('recomputeSession and the dirty queue', () => {
  it('rebuilds every row and drops rows whose work is gone', async () => {
    const stub = seed({
      'quiz_sessions/qs1/responses/u1': completed(),
      'quiz_sessions/qs1/responses/pin-1-99': completed({ studentUid: 'anon' }),
      'grade_index/qs1__gone': { sessionId: 'qs1', studentUid: 'gone' },
    });
    const result = await recomputeSession(
      stub.db as unknown as Db,
      'quiz',
      'qs1',
      NOW
    );
    expect(result).toEqual({ written: 1, deleted: 1 });
    expect(stub.has('grade_index/qs1__u1')).toBe(true);
    expect(stub.has('grade_index/qs1__gone')).toBe(false);
  });

  it('writes nothing when a rerun changes nothing', async () => {
    const stub = seed({ 'quiz_sessions/qs1/responses/u1': completed() });
    const db = stub.db as unknown as Db;
    await recomputeSession(db, 'quiz', 'qs1', NOW);
    expect(await recomputeSession(db, 'quiz', 'qs1', NOW + 1)).toEqual({
      written: 0,
      deleted: 0,
    });
  });

  it('removes every row once the session is deleted', async () => {
    const stub = makeStubFirestore({
      'grade_index/qs9__u1': { sessionId: 'qs9', studentUid: 'u1' },
    });
    expect(
      await recomputeSession(stub.db as unknown as Db, 'quiz', 'qs9', NOW)
    ).toEqual({ written: 0, deleted: 1 });
  });

  it('drains queued sessions and clears the queue entry', async () => {
    const stub = seed({ 'quiz_sessions/qs1/responses/u1': completed() });
    const db = stub.db as unknown as Db;
    await markSessionDirty(db, 'quiz', 'qs1', NOW);
    expect(await drainDirtySessions(db)).toEqual({ recomputed: 1, failed: 0 });
    expect(stub.has('grade_index_sessions/qs1')).toBe(false);
    expect(stub.has('grade_index/qs1__u1')).toBe(true);
  });
});

describe('kill switch', () => {
  it('leaves everything untouched while admin_settings/gradebook_index is off', async () => {
    const stub = seed({ 'admin_settings/gradebook_index': { enabled: false } });
    vi.mocked(admin.firestore).mockReturnValue(stub.db as never);
    await (gradeIndexQuizResponse as unknown as Handler)({
      params: { sessionId: 'qs1', docId: 'u1' },
      data: {
        before: { exists: false, data: () => undefined },
        after: { exists: true, data: () => completed() },
      },
    });
    await (gradeIndexQuizSession as unknown as Handler)({
      params: { sessionId: 'qs1' },
      data: {
        before: { exists: false, data: () => undefined },
        after: { exists: true, data: () => quizSession },
      },
    });
    await runGradeIndexRecompute(stub.db as never);
    expect(stub.writes).toEqual([]);
  });

  it('runs the triggers once it is on', async () => {
    const stub = seed();
    vi.mocked(admin.firestore).mockReturnValue(stub.db as never);
    await (gradeIndexQuizResponse as unknown as Handler)({
      params: { sessionId: 'qs1', docId: 'u1' },
      data: {
        before: { exists: false, data: () => undefined },
        after: { exists: true, data: () => completed() },
      },
    });
    expect(stub.has('grade_index/qs1__u1')).toBe(true);
  });
});

const row = (over: Partial<GradeIndexRow> = {}): GradeIndexRow => ({
  kind: 'quiz',
  sessionId: 'qs1',
  assignmentId: 'qs1',
  ownerUid: 't1',
  editorUids: [],
  rosterIds: ['r1'],
  classIds: ['c1'],
  classId: 'c1',
  rosterId: 'r1',
  studentUid: 'u1',
  title: 'Fractions check',
  completionOnly: false,
  rawPct: 80,
  points: 8,
  max: 10,
  state: 'scored',
  submittedAt: NOW - DAY,
  openAt: null,
  dueAt: NOW,
  closeAt: null,
  late: false,
  attempts: [{ n: 1, pct: 80, points: 8, max: 10, submittedAt: NOW - DAY }],
  targetEvidence: [
    { targetId: 't', kind: 'standard', label: 'T', earned: 1, possible: 2 },
  ],
  published: true,
  assigned: true,
  schemaVersion: 1,
  updatedAt: NOW,
  ...over,
});

const noMark = null;

describe('buildProjectionEntry', () => {
  it('shows a published final score with overrides applied', () => {
    const e = buildProjectionEntry(
      row(),
      {
        override: { points: 9 },
        comment: { text: 'Nice', shared: true },
        flags: [],
        suppressedAuto: [],
        publishOverride: null,
      },
      null,
      DEFAULT_CONFIG,
      NOW
    );
    expect(e).toMatchObject({
      published: true,
      pct: 90,
      points: 9,
      comment: 'Nice',
    });
    expect(e?.targets).toBeUndefined();
  });

  it('never carries an unpublished score or a private comment', () => {
    const e = buildProjectionEntry(
      row({ published: false }),
      {
        override: null,
        comment: { text: 'private', shared: false },
        flags: ['missing'],
        suppressedAuto: [],
        publishOverride: null,
      },
      null,
      DEFAULT_CONFIG,
      NOW
    );
    expect(e).toMatchObject({
      published: false,
      pct: null,
      points: null,
      status: null,
      comment: null,
    });
    expect(e?.flags.map((f) => f.id)).toEqual(['missing']);
  });

  it('hides teacher-only flags and drops the entry when nothing is left', () => {
    const e = buildProjectionEntry(
      row({ published: false }),
      {
        override: null,
        comment: null,
        flags: ['late'],
        suppressedAuto: [],
        publishOverride: null,
      },
      null,
      DEFAULT_CONFIG,
      NOW
    );
    expect(e).toBeNull();
  });

  it('lets a per-student publish override the column', () => {
    const e = buildProjectionEntry(
      row({ published: true }),
      {
        override: null,
        comment: null,
        flags: [],
        suppressedAuto: [],
        publishOverride: false,
      },
      null,
      DEFAULT_CONFIG,
      NOW
    );
    expect(e).toBeNull();
  });

  it('adds target evidence only when the configuration shows standards', () => {
    const config = parseConfig({ studentVisibility: { standards: true } });
    expect(
      buildProjectionEntry(row(), noMark, null, config, NOW)?.targets
    ).toHaveLength(1);
  });

  it('shows nothing for a not-assigned student', () => {
    expect(
      buildProjectionEntry(
        row({ assigned: false }),
        noMark,
        null,
        DEFAULT_CONFIG,
        NOW
      )
    ).toBeNull();
  });
});

describe('projection writes', () => {
  it('writes, updates and removes one class doc per student', async () => {
    const stub = makeStubFirestore();
    const db = stub.db as unknown as Db;
    await projectRow(db, row(), null, NOW);
    const path = 'student_grades/u1/classes/c1';
    expect(stub.get(path)).toMatchObject({
      studentUid: 'u1',
      classId: 'c1',
      entries: { qs1: { pct: 80, updatedAt: NOW } },
    });
    await projectRow(db, row(), null, NOW + 5);
    expect(
      (stub.get(path)?.entries as Record<string, StubData>).qs1.updatedAt
    ).toBe(NOW);
    await projectRow(db, null, row(), NOW + 6);
    expect(stub.has(path)).toBe(false);
  });

  it('keeps other assignments when one entry goes', async () => {
    const stub = makeStubFirestore({
      'student_grades/u1/classes/c1': {
        entries: { other: { pct: 50 }, qs1: { pct: 80 } },
      },
    });
    await writeProjectionEntry(
      stub.db as unknown as Db,
      'u1',
      'c1',
      'qs1',
      null,
      NOW
    );
    expect(
      Object.keys(stub.get('student_grades/u1/classes/c1')?.entries as object)
    ).toEqual(['other']);
  });

  it('reads the class configuration for flag visibility', async () => {
    const stub = makeStubFirestore({
      'users/t1/gradebook_classes/r1': { configRef: 'cfg1' },
      'users/t1/gradebook_settings/cfg1': {
        flags: [
          {
            id: 'late',
            key: 'L',
            name: 'Late',
            color: 'amber',
            visibility: 'students',
          },
        ],
      },
      'gradebook_marks/qs1__u1': { flags: ['late'] },
    });
    await projectRow(
      stub.db as unknown as Db,
      row({ published: false }),
      null,
      NOW
    );
    expect(stub.get('student_grades/u1/classes/c1')).toMatchObject({
      entries: { qs1: { flags: [{ id: 'late', key: 'L', auto: false }] } },
    });
  });

  it('re-projects a row when its mark changes', async () => {
    const stub = makeStubFirestore({
      'admin_settings/gradebook_index': { enabled: true },
      'grade_index/qs1__u1': row() as unknown as StubData,
      'gradebook_marks/qs1__u1': { comment: { text: 'See me', shared: true } },
    });
    vi.mocked(admin.firestore).mockReturnValue(stub.db as never);
    await (gradeIndexMark as unknown as Handler)({
      params: { markId: 'qs1__u1' },
    });
    expect(stub.get('student_grades/u1/classes/c1')).toMatchObject({
      entries: { qs1: { comment: 'See me' } },
    });
  });
});

describe('configPathFor', () => {
  it('resolves personal, district and PLC references', () => {
    expect(configPathFor('t', 'c')).toBe('users/t/gradebook_settings/c');
    expect(configPathFor('t', { kind: 'district', id: 'd' })).toBe(
      'gradebook_district_configs/d'
    );
    expect(configPathFor('t', { kind: 'plc', id: 'p' })).toBe(
      'plcs/p/meta/gradebookSettings'
    );
    expect(configPathFor('t', null)).toBeNull();
    expect(configPathFor('t', { kind: 'plc', id: 'a/b' })).toBeNull();
  });
});
