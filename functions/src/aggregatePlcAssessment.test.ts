// Cloud Function unit tests for `aggregatePlcAssessment` (PRD §5/§6.0/§3.6).
//
// Mirrors the testing posture of `plcQuizSyncJoin.test.ts` /
// `organizationMembersSync.test.ts`: the trigger wrapper's plumbing is thin,
// so the invariants live in the pure compute/resolve helpers, which we test
// directly without an emulator. `recomputePlcAggregate` is exercised against a
// tiny stub Firestore to pin the write path (id keying, serverTimestamp,
// pooling).
//
// The security-critical invariant this suite pins: the output is ANONYMIZED —
// it must NEVER contain a `studentDisplayName` or a per-student row. If that
// ever regresses, the FERPA boundary the whole pipeline exists to enforce has
// collapsed.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin so the module-level `admin.initializeApp()` no-ops and we
// have a stable `serverTimestamp` sentinel to assert against.
const SERVER_TS = { __serverTimestamp: true };
vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: () => SERVER_TS },
  }),
}));

// Mock the firestore trigger factory so importing the module doesn't try to
// register a real trigger; we don't drive the wrapper in these tests.
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_opts: unknown, handler: unknown) => handler),
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import {
  AGGREGATE_SCHEMA_VERSION,
  parseContribution,
  fallbackAggregateId,
  resolveAggregateId,
  contributionsForAggregate,
  computeAggregate,
  recomputePlcAggregate,
  type Contribution,
  type CommonAssessmentLink,
} from './aggregatePlcAssessment';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function contribution(overrides: Partial<Contribution> = {}): Contribution {
  return {
    quizId: 'quiz-1',
    syncGroupId: 'group-1',
    teacherUid: 'teacher-a',
    teacherName: 'Ms. A',
    questionsSnapshot: [
      { id: 'q1', text: 'Question one', points: 1 },
      { id: 'q2', text: 'Question two', points: 2 },
    ],
    responses: [],
    ...overrides,
  };
}

function completed(
  studentDisplayName: string,
  classPeriod: string,
  scorePercent: number | null,
  pointsByQuestionId: Record<string, number>
): Contribution['responses'][number] {
  return {
    studentDisplayName,
    classPeriod,
    status: 'completed',
    scorePercent,
    pointsByQuestionId,
  };
}

// ---------------------------------------------------------------------------
// parseContribution — tolerant parsing of raw Firestore docs
// ---------------------------------------------------------------------------

describe('parseContribution', () => {
  it('returns null for a doc missing teacherUid', () => {
    expect(parseContribution({ quizId: 'q', responses: [] })).toBeNull();
  });

  it('returns null for a doc with neither quizId nor syncGroupId', () => {
    expect(parseContribution({ teacherUid: 't', responses: [] })).toBeNull();
  });

  it('parses a valid doc and normalizes a blank syncGroupId to null', () => {
    const parsed = parseContribution({
      quizId: 'quiz-9',
      syncGroupId: '',
      teacherUid: 'teacher-x',
      teacherName: 'X',
      questionsSnapshot: [{ id: 'q1', text: 'T', points: 1 }],
      responses: [
        {
          studentDisplayName: 'Stu',
          classPeriod: 'P1',
          status: 'completed',
          scorePercent: 50,
          pointsByQuestionId: { q1: 1 },
        },
      ],
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.syncGroupId).toBeNull();
    expect(parsed?.quizId).toBe('quiz-9');
    expect(parsed?.responses).toHaveLength(1);
  });

  it('drops malformed questions/responses without throwing', () => {
    const parsed = parseContribution({
      quizId: 'quiz-9',
      teacherUid: 'teacher-x',
      questionsSnapshot: [null, { id: '', text: 'bad' }, { id: 'q1' }],
      responses: [null, 42, { status: 'completed' }],
    });
    expect(parsed?.questionsSnapshot.map((q) => q.id)).toEqual(['q1']);
    // The `{ status: 'completed' }` response survives (tolerant defaults).
    expect(parsed?.responses).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Canonical id resolution (Decision 4.0c — prefer designated assessment)
// ---------------------------------------------------------------------------

describe('resolveAggregateId — canonical id resolution', () => {
  it('falls back to syncGroupId when no assessment designates it', () => {
    const c = contribution({ syncGroupId: 'group-1', quizId: 'local-quiz' });
    expect(resolveAggregateId(c, [])).toBe('group-1');
    expect(fallbackAggregateId(c)).toBe('group-1');
  });

  it('falls back to quizId for an unsynced contribution', () => {
    const c = contribution({ syncGroupId: null, quizId: 'local-quiz' });
    expect(resolveAggregateId(c, [])).toBe('local-quiz');
  });

  it('PREFERS the designated PlcCommonAssessment id over the syncGroup fallback', () => {
    const c = contribution({ syncGroupId: 'group-1' });
    const assessments: CommonAssessmentLink[] = [
      { id: 'assessment-canonical', syncGroupId: 'group-1' },
    ];
    // The designated assessment id wins — this is what kills heuristic
    // title-matching: results aggregate to the team's canonical id.
    expect(resolveAggregateId(c, assessments)).toBe('assessment-canonical');
  });

  it('ignores a soft-deleted assessment and falls back', () => {
    const c = contribution({ syncGroupId: 'group-1' });
    const assessments: CommonAssessmentLink[] = [
      { id: 'assessment-canonical', syncGroupId: 'group-1', deletedAt: 123 },
    ];
    expect(resolveAggregateId(c, assessments)).toBe('group-1');
  });

  it('ignores an assessment designating a different syncGroupId', () => {
    const c = contribution({ syncGroupId: 'group-1' });
    const assessments: CommonAssessmentLink[] = [
      { id: 'other', syncGroupId: 'group-2' },
    ];
    expect(resolveAggregateId(c, assessments)).toBe('group-1');
  });

  it('is deterministic when two assessments claim the same syncGroupId (smallest id wins)', () => {
    const c = contribution({ syncGroupId: 'group-1' });
    const assessments: CommonAssessmentLink[] = [
      { id: 'zeta', syncGroupId: 'group-1' },
      { id: 'alpha', syncGroupId: 'group-1' },
    ];
    expect(resolveAggregateId(c, assessments)).toBe('alpha');
  });
});

describe('contributionsForAggregate', () => {
  it('pools only contributions that resolve to the same aggregate id', () => {
    const assessments: CommonAssessmentLink[] = [
      { id: 'canonical', syncGroupId: 'group-1' },
    ];
    const a = contribution({ teacherUid: 'a', syncGroupId: 'group-1' });
    const b = contribution({ teacherUid: 'b', syncGroupId: 'group-1' });
    const other = contribution({
      teacherUid: 'c',
      syncGroupId: 'group-2',
      quizId: 'q2',
    });
    const pooled = contributionsForAggregate(
      'canonical',
      [a, b, other],
      assessments
    );
    expect(pooled.map((c) => c.teacherUid).sort()).toEqual(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// computeAggregate — anonymized math
// ---------------------------------------------------------------------------

describe('computeAggregate — correctPercent math', () => {
  it('computes per-question correctPercent across all teachers students', () => {
    // q1: 3 answered, 2 correct → 67% ; q2: 2 answered, 1 correct → 50%
    const c = contribution({
      responses: [
        completed('S1', 'P1', 100, { q1: 1, q2: 2 }),
        completed('S2', 'P1', 50, { q1: 1, q2: 0 }),
        completed('S3', 'P1', 0, { q1: 0 }),
      ],
    });
    const agg = computeAggregate('canonical', [c]);
    const q1 = agg.perQuestion.find((q) => q.questionId === 'q1');
    const q2 = agg.perQuestion.find((q) => q.questionId === 'q2');
    expect(q1?.correctPercent).toBe(67);
    expect(q2?.correctPercent).toBe(50);
    expect(q1?.points).toBe(1);
    expect(q2?.points).toBe(2);
  });

  it('excludes in-progress responses from all counts', () => {
    const c = contribution({
      responses: [
        completed('S1', 'P1', 100, { q1: 1, q2: 2 }),
        {
          studentDisplayName: 'S2',
          classPeriod: 'P1',
          status: 'in-progress',
          scorePercent: null,
          pointsByQuestionId: { q1: 0 },
        },
      ],
    });
    const agg = computeAggregate('canonical', [c]);
    expect(agg.studentCount).toBe(1);
    expect(agg.teamAveragePercent).toBe(100);
    const q1 = agg.perQuestion.find((q) => q.questionId === 'q1');
    expect(q1?.correctPercent).toBe(100); // only the completed response counts
  });

  it('reports 0% for a question with no answered responses', () => {
    const c = contribution({
      responses: [completed('S1', 'P1', 50, { q1: 1 })], // q2 unanswered
    });
    const agg = computeAggregate('canonical', [c]);
    const q2 = agg.perQuestion.find((q) => q.questionId === 'q2');
    expect(q2?.correctPercent).toBe(0);
  });

  it('computes teamAveragePercent as the mean of completed scorePercents', () => {
    const c = contribution({
      responses: [
        completed('S1', 'P1', 80, { q1: 1 }),
        completed('S2', 'P1', 60, { q1: 0 }),
      ],
    });
    const agg = computeAggregate('canonical', [c]);
    expect(agg.teamAveragePercent).toBe(70);
  });
});

describe('computeAggregate — anonymization (FERPA boundary)', () => {
  it('emits NO studentDisplayName anywhere in the output', () => {
    const c = contribution({
      responses: [
        completed('Alice Student', 'P1', 100, { q1: 1, q2: 2 }),
        completed('Bob Student', 'P2', 50, { q1: 1, q2: 0 }),
      ],
    });
    const agg = computeAggregate('canonical', [c]);
    const serialized = JSON.stringify(agg);
    expect(serialized).not.toContain('Alice Student');
    expect(serialized).not.toContain('Bob Student');
    expect(serialized).not.toContain('studentDisplayName');
  });

  it('perTeacher rows carry counts only — no per-student rows', () => {
    const c = contribution({
      teacherUid: 'teacher-a',
      teacherName: 'Ms. A',
      responses: [
        completed('Alice', 'P1', 100, { q1: 1 }),
        completed('Bob', 'P2', 50, { q1: 0 }),
      ],
    });
    const agg = computeAggregate('canonical', [c]);
    expect(agg.perTeacher).toHaveLength(1);
    const row = agg.perTeacher[0];
    expect(row).toEqual({
      teacherUid: 'teacher-a',
      teacherName: 'Ms. A',
      classCount: 2, // distinct classPeriod P1 + P2
      averagePercent: 75,
      studentCount: 2,
    });
    // No `students`/`responses`/`names` key leaked onto the row.
    expect(Object.keys(row).sort()).toEqual([
      'averagePercent',
      'classCount',
      'studentCount',
      'teacherName',
      'teacherUid',
    ]);
  });
});

describe('computeAggregate — multi-teacher rollup', () => {
  it('rolls up across teachers, counting teachers/students/classes correctly', () => {
    const a = contribution({
      teacherUid: 'teacher-a',
      teacherName: 'Ms. A',
      responses: [
        completed('A1', 'P1', 100, { q1: 1, q2: 2 }),
        completed('A2', 'P1', 0, { q1: 0, q2: 0 }),
      ],
    });
    const b = contribution({
      teacherUid: 'teacher-b',
      teacherName: 'Mr. B',
      responses: [completed('B1', 'P3', 50, { q1: 1, q2: 0 })],
    });
    const agg = computeAggregate('canonical', [a, b]);
    expect(agg.teacherCount).toBe(2);
    expect(agg.studentCount).toBe(3);
    // team avg = mean(100, 0, 50) = 50
    expect(agg.teamAveragePercent).toBe(50);
    // perTeacher sorted by teacherUid
    expect(agg.perTeacher.map((t) => t.teacherUid)).toEqual([
      'teacher-a',
      'teacher-b',
    ]);
    expect(agg.perTeacher[0].studentCount).toBe(2);
    expect(agg.perTeacher[1].studentCount).toBe(1);
    // q1: 3 answered, 2 correct → 67%
    const q1 = agg.perQuestion.find((q) => q.questionId === 'q1');
    expect(q1?.correctPercent).toBe(67);
  });

  it('does not inflate teacherCount for an all-in-progress contribution', () => {
    const a = contribution({
      teacherUid: 'teacher-a',
      responses: [completed('A1', 'P1', 100, { q1: 1 })],
    });
    const b = contribution({
      teacherUid: 'teacher-b',
      responses: [
        {
          studentDisplayName: 'B1',
          classPeriod: 'P2',
          status: 'in-progress',
          scorePercent: null,
          pointsByQuestionId: {},
        },
      ],
    });
    const agg = computeAggregate('canonical', [a, b]);
    expect(agg.teacherCount).toBe(1);
    expect(agg.perTeacher.map((t) => t.teacherUid)).toEqual(['teacher-a']);
  });
});

describe('computeAggregate — empty / withdrawn handling', () => {
  it('returns a zeroed aggregate for no contributions', () => {
    const agg = computeAggregate('canonical', []);
    expect(agg).toEqual({
      assessmentId: 'canonical',
      schemaVersion: AGGREGATE_SCHEMA_VERSION,
      teacherCount: 0,
      studentCount: 0,
      teamAveragePercent: 0,
      perQuestion: [],
      perTeacher: [],
    });
  });

  it('treats a withdrawn (no-response) contribution as contributing nothing', () => {
    const c = contribution({ responses: [] });
    const agg = computeAggregate('canonical', [c]);
    expect(agg.teacherCount).toBe(0);
    expect(agg.studentCount).toBe(0);
    expect(agg.perTeacher).toEqual([]);
    // Question identity is still surfaced (so the UI can render the columns)
    // but all correctPercent are 0.
    expect(agg.perQuestion.map((q) => q.correctPercent)).toEqual([0, 0]);
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('computeAggregate — idempotency', () => {
  it('produces byte-identical output for the same input', () => {
    const build = () => [
      contribution({
        teacherUid: 'teacher-b',
        responses: [completed('B1', 'P2', 50, { q1: 1, q2: 0 })],
      }),
      contribution({
        teacherUid: 'teacher-a',
        responses: [completed('A1', 'P1', 100, { q1: 1, q2: 2 })],
      }),
    ];
    const first = computeAggregate('canonical', build());
    const second = computeAggregate('canonical', build());
    // Same input → same output regardless of how many times it runs (the
    // recompute is a pure function of the subcollection snapshot).
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('is stable to input ordering (sorted output)', () => {
    const a = contribution({
      teacherUid: 'teacher-a',
      responses: [completed('A1', 'P1', 100, { q1: 1 })],
    });
    const b = contribution({
      teacherUid: 'teacher-b',
      responses: [completed('B1', 'P2', 50, { q1: 0 })],
    });
    const forward = computeAggregate('canonical', [a, b]);
    const reversed = computeAggregate('canonical', [b, a]);
    expect(JSON.stringify(forward)).toBe(JSON.stringify(reversed));
  });
});

// ---------------------------------------------------------------------------
// recomputePlcAggregate — write path (stub Firestore)
// ---------------------------------------------------------------------------

interface CapturedWrite {
  path: string;
  data: Record<string, unknown>;
}

function makeDb(writes: CapturedWrite[]) {
  const docRef = (path: string) => ({
    __path: path,
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
    set: (data: Record<string, unknown>) => {
      writes.push({ path, data });
      return Promise.resolve();
    },
  });
  const collectionRef = (path: string) => ({
    doc: (id: string) => docRef(`${path}/${id}`),
  });
  return {
    collection: (name: string) => collectionRef(name),
  };
}

describe('recomputePlcAggregate — write path', () => {
  let writes: CapturedWrite[];
  beforeEach(() => {
    writes = [];
  });

  it('writes the aggregate keyed on the resolved id with a serverTimestamp ranAt', async () => {
    const db = makeDb(writes) as unknown as Parameters<
      typeof recomputePlcAggregate
    >[0];
    const c = contribution({
      syncGroupId: 'group-1',
      responses: [completed('S1', 'P1', 100, { q1: 1, q2: 2 })],
    });
    const assessments: CommonAssessmentLink[] = [
      { id: 'canonical', syncGroupId: 'group-1' },
    ];
    await recomputePlcAggregate(db, 'plc-1', 'canonical', [c], assessments);

    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe('plcs/plc-1/aggregates/canonical');
    const data = writes[0].data;
    expect(data.assessmentId).toBe('canonical');
    expect(data.teacherCount).toBe(1);
    expect(data.studentCount).toBe(1);
    // ranAt is the serverTimestamp sentinel (non-deterministic field).
    expect((data as { ranAt: unknown }).ranAt).toBeDefined();
    // Output is anonymized even on the write path.
    expect(JSON.stringify(data)).not.toContain('S1');
    expect(JSON.stringify(data)).not.toContain('studentDisplayName');
  });

  it('pools only the contributions belonging to the aggregate id', async () => {
    const db = makeDb(writes) as unknown as Parameters<
      typeof recomputePlcAggregate
    >[0];
    const assessments: CommonAssessmentLink[] = [
      { id: 'canonical', syncGroupId: 'group-1' },
    ];
    const inGroup = contribution({
      teacherUid: 'a',
      syncGroupId: 'group-1',
      responses: [completed('A1', 'P1', 100, { q1: 1 })],
    });
    const otherGroup = contribution({
      teacherUid: 'b',
      syncGroupId: 'group-2',
      quizId: 'q2',
      responses: [completed('B1', 'P1', 0, { q1: 0 })],
    });
    await recomputePlcAggregate(
      db,
      'plc-1',
      'canonical',
      [inGroup, otherGroup],
      assessments
    );
    // Only the group-1 teacher pools into the canonical aggregate.
    expect(writes[0].data.teacherCount).toBe(1);
    expect(
      (
        writes[0].data as { perTeacher: Array<{ teacherUid: string }> }
      ).perTeacher.map((t) => t.teacherUid)
    ).toEqual(['a']);
  });
});
