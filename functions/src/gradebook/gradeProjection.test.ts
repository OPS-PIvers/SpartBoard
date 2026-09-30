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
import { __resetGradeIndexEnabledCache } from './gradeIndex';
import {
  configPathFor,
  parseMark,
  parseSettings,
  projectRow,
  writeProjectionEntry,
} from './gradeProjection';
import {
  gradeIndexMark,
  handlePointerWrite,
  handleSharedConfigWrite,
} from './gradeIndexTriggers';
import { makeStubFirestore, type StubData } from '../testing/stubFirestore';
import { DEFAULT_PROFICIENCY_SCALE } from '../gradebookCore';
import type { IndexRow } from './types';

type Db = Parameters<typeof projectRow>[0];
type Handler = (event: { params: Record<string, string> }) => Promise<void>;

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;
const PATH = 'student_grades/u1/classes/c1';

const row = (over: Partial<IndexRow> = {}): IndexRow => ({
  kind: 'quiz',
  sessionId: 'qs1',
  assignmentId: 'qs1',
  studentUid: 'u1',
  ownerUid: 't1',
  editorUids: [],
  rosterIds: ['r1'],
  classIds: ['c1'],
  classId: 'c1',
  rosterId: 'r1',
  title: 'Fractions check',
  rawPct: 80,
  points: 8,
  max: 10,
  state: 'scored',
  submittedAt: NOW - DAY,
  dueAt: NOW,
  openAt: null,
  closeAt: null,
  createdAt: NOW - 2 * DAY,
  attempts: [{ n: 1, at: NOW - DAY, points: 8, max: 10, state: 'scored' }],
  targetEvidence: [
    { targetId: 'tgt', kind: 'standard', earned: 1, possible: 2 },
  ],
  published: true,
  assigned: true,
  schemaVersion: 1,
  updatedAt: NOW,
  ...over,
});

const entryOf = (stub: ReturnType<typeof makeStubFirestore>, id = 'qs1') =>
  (stub.get(PATH)?.entries as Record<string, StubData> | undefined)?.[id];

beforeEach(() => __resetGradeIndexEnabledCache());

describe('projectRow', () => {
  it('shows a published final score with the override applied', async () => {
    const stub = makeStubFirestore({
      'gradebook_marks/qs1__u1': {
        override: { points: 9, at: 1 },
        comment: { text: 'Nice work', shared: true, at: 1 },
      },
    });
    await projectRow(stub.db as unknown as Db, row(), null, NOW);
    expect(stub.get(PATH)).toMatchObject({
      studentUid: 'u1',
      classId: 'c1',
      ownerUid: 't1',
      standards: null,
    });
    expect(entryOf(stub)).toMatchObject({
      status: 'scored',
      points: 9,
      pct: 90,
      comment: 'Nice work',
      updatedAt: NOW,
    });
  });

  it('never carries an unpublished score or a private comment', async () => {
    const stub = makeStubFirestore({
      'gradebook_marks/qs1__u1': {
        comment: { text: 'private', shared: false, at: 1 },
        flags: ['missing'],
      },
    });
    await projectRow(
      stub.db as unknown as Db,
      row({ published: false }),
      null,
      NOW
    );
    const e = entryOf(stub);
    expect(e).toMatchObject({
      status: 'hidden',
      points: null,
      pct: null,
      comment: null,
    });
    expect(JSON.stringify(stub.get(PATH))).not.toContain('private');
    expect((e?.flags as { id: string }[]).map((f) => f.id)).toEqual([
      'missing',
    ]);
  });

  it('follows a per-student unpublish', async () => {
    const stub = makeStubFirestore({
      'gradebook_marks/qs1__u1': { publishOverride: 'unpublished' },
    });
    await projectRow(stub.db as unknown as Db, row(), null, NOW);
    expect(entryOf(stub)).toMatchObject({ status: 'hidden', pct: null });
  });

  it('hides teacher-only flags', async () => {
    const stub = makeStubFirestore({
      'gradebook_marks/qs1__u1': { flags: ['late'] },
    });
    await projectRow(stub.db as unknown as Db, row(), null, NOW);
    expect(entryOf(stub)?.flags).toEqual([]);
  });

  it('leaves out a student who is not assigned', async () => {
    const stub = makeStubFirestore();
    await projectRow(
      stub.db as unknown as Db,
      row({ assigned: false }),
      null,
      NOW
    );
    expect(stub.has(PATH)).toBe(false);
  });

  it('only moves updatedAt when what the student sees changes', async () => {
    const stub = makeStubFirestore();
    const db = stub.db as unknown as Db;
    await projectRow(db, row(), null, NOW);
    await projectRow(db, row({ updatedAt: NOW + 5 }), null, NOW + 5);
    expect(entryOf(stub)?.updatedAt).toBe(NOW);
    await projectRow(db, row({ points: 10, rawPct: 100 }), null, NOW + 6);
    expect(entryOf(stub)?.updatedAt).toBe(NOW + 6);
  });

  it('removes the doc with its last entry and moves an entry between classes', async () => {
    const stub = makeStubFirestore();
    const db = stub.db as unknown as Db;
    await projectRow(db, row(), null, NOW);
    await projectRow(db, row({ classId: 'c2' }), row(), NOW);
    expect(stub.has(PATH)).toBe(false);
    expect(stub.has('student_grades/u1/classes/c2')).toBe(true);
    await projectRow(db, null, row({ classId: 'c2' }), NOW);
    expect(stub.has('student_grades/u1/classes/c2')).toBe(false);
  });

  it('keeps other assignments when one entry goes', async () => {
    const stub = makeStubFirestore({
      [PATH]: { entries: { other: { pct: 50 }, qs1: { pct: 80 } } },
    });
    await writeProjectionEntry(
      stub.db as unknown as Db,
      { studentUid: 'u1', classId: 'c1', ownerUid: 't1' },
      'qs1',
      null,
      { standards: null, scale: DEFAULT_PROFICIENCY_SCALE },
      NOW
    );
    expect(Object.keys(stub.get(PATH)?.entries as object)).toEqual(['other']);
  });

  it('reads flag visibility from the class configuration', async () => {
    const stub = makeStubFirestore({
      'users/t1/gradebook_classes/r1': {
        configRef: { source: 'personal', configId: 'cfg1' },
      },
      'users/t1/gradebook_settings/cfg1': {
        flags: [
          {
            id: 'late',
            name: 'Late',
            key: 'L',
            color: 'amber',
            value: null,
            visibility: 'students',
            builtIn: true,
          },
        ],
      },
      'gradebook_marks/qs1__u1': { flags: ['late'] },
    });
    await projectRow(stub.db as unknown as Db, row(), null, NOW);
    expect(entryOf(stub)?.flags).toEqual([
      { id: 'late', name: 'Late', key: 'L', color: 'amber' },
    ]);
  });

  it('adds standards from published work only when the configuration shows them', async () => {
    const stub = makeStubFirestore({
      'users/t1/gradebook_classes/r1': {
        configRef: { source: 'personal', configId: 'cfg1' },
      },
      'users/t1/gradebook_settings/cfg1': {
        studentVisibility: { standards: true },
        method: 'mean',
      },
      'grade_index/qs2__u1': row({
        sessionId: 'qs2',
        published: false,
        targetEvidence: [
          { targetId: 'tgt', kind: 'standard', earned: 0, possible: 2 },
        ],
      }) as unknown as StubData,
    });
    await projectRow(stub.db as unknown as Db, row(), null, NOW);
    expect(stub.get(PATH)?.standards).toEqual([
      { targetId: 'tgt', pct: 50, level: 2 },
    ]);
  });
});

describe('triggers', () => {
  it('re-projects a row when its mark changes', async () => {
    const stub = makeStubFirestore({
      'admin_settings/gradebook_index': { enabled: true },
      'grade_index/qs1__u1': row() as unknown as StubData,
      'gradebook_marks/qs1__u1': {
        comment: { text: 'See me', shared: true, at: 1 },
      },
    });
    vi.mocked(admin.firestore).mockReturnValue(stub.db as never);
    await (gradeIndexMark as unknown as Handler)({
      params: { markId: 'qs1__u1' },
    });
    expect(entryOf(stub)).toMatchObject({ comment: 'See me' });
  });

  it('re-projects classes linked to a PLC configuration', async () => {
    const stub = makeStubFirestore({
      'admin_settings/gradebook_index': { enabled: true },
      'grade_index/qs1__u1': row() as unknown as StubData,
      'users/t1/gradebook_classes/r1': {
        configRef: { source: 'plc', plcId: 'plc1' },
      },
      'plcs/plc1/meta/gradebookSettings': {
        studentVisibility: { scores: false },
      },
      [PATH]: { entries: { qs1: { status: 'scored', pct: 80 } } },
    });
    vi.mocked(admin.firestore).mockReturnValue(stub.db as never);
    await handleSharedConfigWrite('plc', 'plc1');
    expect(entryOf(stub)).toMatchObject({ status: 'hidden', pct: null });
  });

  it('queues the session when a targeting pointer changes', async () => {
    const stub = makeStubFirestore({
      'admin_settings/gradebook_index': { enabled: true },
    });
    vi.mocked(admin.firestore).mockReturnValue(stub.db as never);
    await handlePointerWrite({
      params: {},
      data: {
        before: { exists: false, data: () => undefined },
        after: {
          exists: true,
          data: () => ({ kind: 'quiz', sessionId: 'qs1', dueAt: 5 }),
        },
      },
    });
    expect(stub.get('grade_index_sessions/qs1')).toMatchObject({
      kind: 'quiz',
    });
  });
});

describe('parsing', () => {
  it('resolves personal, district and PLC references', () => {
    expect(configPathFor('t', { source: 'personal', configId: 'c' })).toBe(
      'users/t/gradebook_settings/c'
    );
    expect(configPathFor('t', { source: 'district', configId: 'd' })).toBe(
      'gradebook_district_configs/d'
    );
    expect(configPathFor('t', { source: 'plc', plcId: 'p' })).toBe(
      'plcs/p/meta/gradebookSettings'
    );
    expect(configPathFor('t', null)).toBeNull();
    expect(configPathFor('t', { source: 'plc', plcId: 'a/b' })).toBeNull();
  });

  it('fills a partial configuration from the defaults', () => {
    const s = parseSettings({ studentVisibility: { standards: true } });
    expect(s.studentVisibility).toEqual({
      scores: true,
      flags: true,
      comments: true,
      standards: true,
    });
    expect(s.flags.map((f) => f.id)).toContain('missing');
  });

  it('drops a malformed publish override', () => {
    expect(parseMark({ publishOverride: true })?.publishOverride).toBeNull();
  });
});
