import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRADEBOOK_SETTINGS,
  DEFAULT_PROFICIENCY_SCALE,
  type GradeIndexRow,
  type GradebookMark,
  type StudentGradeEntry,
} from './gradebookCore';
import {
  buildStudentGradesPreview,
  isNewRow,
  seenMarksFor,
  studentGradeRows,
  type StudentGradeRow,
} from './studentGrades';

const row = (over: Partial<GradeIndexRow> = {}): GradeIndexRow => ({
  kind: 'quiz',
  sessionId: 's1',
  studentUid: 'u',
  ownerUid: 't',
  editorUids: [],
  rosterIds: ['r'],
  classIds: ['c'],
  title: 'Quiz 1',
  rawPct: 80,
  points: 8,
  max: 10,
  state: 'scored',
  submittedAt: 5,
  dueAt: 10,
  openAt: null,
  closeAt: null,
  createdAt: 0,
  attempts: [],
  targetEvidence: [
    {
      targetId: 't1',
      kind: 'standard',
      code: 'RL.1',
      label: 'Cite evidence',
      earned: 8,
      possible: 10,
    },
  ],
  published: true,
  assigned: true,
  updatedAt: 5,
  ...over,
});

const mark = (over: Partial<GradebookMark> = {}): GradebookMark => ({
  kind: 'quiz',
  sessionId: 's1',
  studentUid: 'u',
  ownerUid: 't',
  editorUids: [],
  rosterIds: ['r'],
  override: null,
  comment: null,
  flags: [],
  suppressedAuto: [],
  publishOverride: null,
  updatedAt: 0,
  ...over,
});

const entry = (over: Partial<StudentGradeEntry> = {}): StudentGradeEntry => ({
  kind: 'quiz',
  title: 'A',
  dueAt: 1,
  status: 'scored',
  points: 8,
  max: 10,
  pct: 80,
  flags: [],
  comment: null,
  ...over,
});

const base = {
  marksBySession: {},
  columnsBySession: {},
  settings: DEFAULT_GRADEBOOK_SETTINGS,
  scale: DEFAULT_PROFICIENCY_SCALE,
  now: 100,
};

describe('studentGradeRows', () => {
  it('drops hidden rows with nothing to show and puts the newest due first', () => {
    const rows = studentGradeRows({
      entries: {
        a: entry({ title: 'Old', dueAt: 1 }),
        b: entry({ title: 'New', dueAt: 9 }),
        c: entry({ title: 'Hidden', status: 'hidden', points: null }),
        d: entry({
          title: 'Missing',
          status: 'hidden',
          dueAt: 5,
          flags: [{ id: 'missing', name: 'Missing', key: 'M', color: 'rose' }],
        }),
      },
      standards: null,
      levelNames: DEFAULT_PROFICIENCY_SCALE.levelNames,
      cutoffs: { proficient: 80, approaching: 60 },
    });
    expect(rows.map((r) => r.title)).toEqual(['New', 'Missing', 'Old']);
  });
});

describe('isNewRow', () => {
  const r = (over: Partial<StudentGradeEntry> = {}): StudentGradeRow => ({
    ...entry(over),
    sessionId: 's',
    updatedAt: 0,
  });

  it('marks a new score, comment or Missing flag and nothing already seen', () => {
    const seen = seenMarksFor([r()]);
    expect(isNewRow(r(), seen)).toBe(false);
    expect(isNewRow(r(), {})).toBe(true);
    expect(isNewRow(r({ points: 9 }), seen)).toBe(true);
    expect(isNewRow(r({ comment: 'Nice' }), seen)).toBe(true);
    expect(
      isNewRow(
        r({
          flags: [{ id: 'missing', name: 'Missing', key: 'M', color: 'rose' }],
        }),
        seen
      )
    ).toBe(true);
    expect(isNewRow(r({ status: 'hidden', points: null }), {})).toBe(false);
  });
});

describe('buildStudentGradesPreview', () => {
  it('shows only what the student may see', () => {
    const data = buildStudentGradesPreview({
      ...base,
      rows: [
        row(),
        row({ sessionId: 's2', title: 'Unpublished', published: false }),
      ],
      marksBySession: {
        s1: mark({ comment: { text: 'Private', shared: false, at: 1 } }),
        s2: mark({
          sessionId: 's2',
          comment: { text: 'Shared', shared: true, at: 1 },
          flags: ['late'],
        }),
      },
    });
    expect(data.entries.s1).toMatchObject({
      status: 'scored',
      points: 8,
      comment: null,
    });
    expect(data.entries.s2).toMatchObject({
      status: 'hidden',
      points: null,
      comment: null,
      flags: [],
    });
    expect(data.standards).toBeNull();
  });

  it('ignores a mark written by someone other than the session owner', () => {
    const data = buildStudentGradesPreview({
      ...base,
      rows: [row()],
      marksBySession: {
        s1: mark({ ownerUid: 'x', override: { points: 1, at: 1 } }),
      },
    });
    expect(data.entries.s1.points).toBe(8);
  });

  it('names each target when standards are shown', () => {
    const data = buildStudentGradesPreview({
      ...base,
      settings: {
        ...DEFAULT_GRADEBOOK_SETTINGS,
        studentVisibility: {
          ...DEFAULT_GRADEBOOK_SETTINGS.studentVisibility,
          standards: true,
        },
      },
      rows: [row()],
    });
    expect(data.standards).toEqual([
      {
        targetId: 't1',
        code: 'RL.1',
        label: 'Cite evidence',
        pct: 80,
        level: 0,
        evidence: [{ sessionId: 's1', pct: 80, at: 5 }],
      },
    ]);
    expect(data.cutoffs).toEqual({ proficient: 80, approaching: 60 });
  });
});
