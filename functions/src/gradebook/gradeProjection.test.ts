import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebaseAdmin', () => ({
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

import * as admin from '../firebaseAdmin';
import { __resetGradeIndexEnabledCache } from './gradeIndex';
import {
  __setClassEnrollmentCheck,
  configPathFor,
  parseMark,
  parseSettings,
  projectRow,
  removeFlagsOnScore,
  writeProjectionEntry,
  type ClassEnrollmentCheck,
} from './gradeProjection';
import { RosterUnavailableError } from './rosterUnavailable';
import {
  gradeIndexMark,
  handleRowWrite,
  handlePointerWrite,
  handleSharedConfigWrite,
  handleSideDocWrite,
  handleStudentDocWrite,
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

const allEnrolled: ClassEnrollmentCheck = () => Promise.resolve(true);

beforeEach(() => {
  __resetGradeIndexEnabledCache();
  __setClassEnrollmentCheck(allEnrolled);
});

/** Only these `owner/class/student` triples are on a roster. */
const rosterOf =
  (...allowed: string[]): ClassEnrollmentCheck =>
  (owner, classId, student) =>
    Promise.resolve(allowed.includes(`${owner}/${classId}/${student}`));

describe('projectRow roster check', () => {
  it('projects nothing for a class the owner does not teach', async () => {
    const stub = makeStubFirestore();
    const enrolled = vi.fn(rosterOf('t1/c9/u1'));
    await projectRow(stub.db as unknown as Db, row(), null, NOW, enrolled);
    expect(enrolled).toHaveBeenCalledWith('t1', 'c1', 'u1');
    expect(stub.has(PATH)).toBe(false);
  });

  it('projects nothing for a student outside the class roster', async () => {
    const stub = makeStubFirestore();
    await projectRow(
      stub.db as unknown as Db,
      row({ studentUid: 'victim' }),
      null,
      NOW,
      rosterOf('t1/c1/u1')
    );
    expect(stub.has('student_grades/victim/classes/c1')).toBe(false);
  });

  it('projects a vouched row', async () => {
    const stub = makeStubFirestore();
    await projectRow(
      stub.db as unknown as Db,
      row(),
      null,
      NOW,
      rosterOf('t1/c1/u1')
    );
    expect(entryOf(stub)).toMatchObject({ ownerUid: 't1' });
  });

  it("keeps an owner's past entries but refuses new ones once the roster drops them", async () => {
    const stub = makeStubFirestore();
    const db = stub.db as unknown as Db;
    await projectRow(db, row(), null, NOW);
    await projectRow(db, row({ ownerUid: 't2', sessionId: 'x1' }), null, NOW);
    const before = stub.get(PATH);
    const shown = entryOf(stub, 'x1');
    expect(shown).toMatchObject({ ownerUid: 't2', vouched: true });
    const subSwap = rosterOf('t1/c1/u1');
    await projectRow(
      db,
      row({ ownerUid: 't2', sessionId: 'x1', points: 1, rawPct: 10 }),
      null,
      NOW + 1,
      subSwap
    );
    await projectRow(
      db,
      row({ ownerUid: 't2', sessionId: 'x2' }),
      null,
      NOW + 1,
      subSwap
    );
    await projectRow(
      db,
      row({ points: 9, rawPct: 90 }),
      null,
      NOW + 2,
      subSwap
    );
    expect(entryOf(stub, 'x1')).toEqual(shown);
    expect(entryOf(stub, 'x2')).toBeUndefined();
    expect(entryOf(stub)).toMatchObject({ ownerUid: 't1', updatedAt: NOW + 2 });
    expect(stub.get(PATH)).toMatchObject({
      ownerUid: 't1',
      standards: before?.standards,
      cutoffs: before?.cutoffs,
    });
  });

  it("removes an unvouched owner's unstamped entry without touching the class fields", async () => {
    const stub = makeStubFirestore();
    const db = stub.db as unknown as Db;
    await projectRow(db, row(), null, NOW);
    const doc = stub.get(PATH) as StubData & {
      entries: Record<string, StubData>;
    };
    stub.store.set(PATH, {
      ...doc,
      entries: { ...doc.entries, x1: { ownerUid: 't2', status: 'scored' } },
    });
    await projectRow(
      db,
      row({ ownerUid: 't2', sessionId: 'x1' }),
      null,
      NOW + 1,
      rosterOf('t1/c1/u1')
    );
    expect(entryOf(stub, 'x1')).toBeUndefined();
    expect(stub.get(PATH)).toMatchObject({
      ownerUid: 't1',
      standards: doc.standards,
    });
  });

  it("drops a planted owner's entries and class fields when a teacher of the class projects", async () => {
    const stub = makeStubFirestore({
      [PATH]: {
        studentUid: 'u1',
        classId: 'c1',
        ownerUid: 'evil',
        standards: [{ targetId: 'fake', pct: 100, level: 4, evidence: [] }],
        levelNames: ['Fake'],
        levels: 1,
        cutoffs: { proficient: 1, approaching: 0 },
        entries: {
          planted: { ownerUid: 'evil', status: 'scored', comment: 'Fake' },
        },
        updatedAt: 1,
      },
    });
    await projectRow(
      stub.db as unknown as Db,
      row(),
      null,
      NOW,
      rosterOf('t1/c1/u1')
    );
    const doc = stub.get(PATH);
    expect(Object.keys(doc?.entries as object)).toEqual(['qs1']);
    expect(doc).toMatchObject({ ownerUid: 't1', standards: null });
  });

  it('never lets an unvouched owner claim the class fields when an entry leaves', async () => {
    const stub = makeStubFirestore();
    const db = stub.db as unknown as Db;
    await projectRow(db, row(), null, NOW);
    await projectRow(
      db,
      null,
      row({ ownerUid: 't2', sessionId: 'x1' }),
      NOW + 1,
      rosterOf('t1/c1/u1')
    );
    expect(stub.get(PATH)).toMatchObject({ ownerUid: 't1' });
    expect(entryOf(stub)).toBeTruthy();
  });

  it('retries the projection event when the roster service is down', async () => {
    const stub = makeStubFirestore({
      'admin_settings/gradebook_index': { enabled: true },
    });
    vi.mocked(admin.firestore).mockReturnValue(stub.db as never);
    __setClassEnrollmentCheck(() =>
      Promise.reject(new RosterUnavailableError(new Error('down')))
    );
    const event = {
      params: { rowId: 'quiz__qs1__u1' },
      time: new Date().toISOString(),
      data: {
        before: { exists: false, data: () => undefined },
        after: { exists: true, data: () => row() as unknown as StubData },
      },
    };
    await expect(handleRowWrite(event)).rejects.toBeInstanceOf(
      RosterUnavailableError
    );
    expect(stub.has(PATH)).toBe(false);
  });

  it('retries the projection event when any roster lookup fails', async () => {
    const stub = makeStubFirestore({
      'admin_settings/gradebook_index': { enabled: true },
    });
    vi.mocked(admin.firestore).mockReturnValue(stub.db as never);
    __setClassEnrollmentCheck(() =>
      Promise.reject(new Error('Server configuration missing.'))
    );
    const event = {
      params: { rowId: 'quiz__qs1__u1' },
      time: new Date().toISOString(),
      data: {
        before: { exists: false, data: () => undefined },
        after: { exists: true, data: () => row() as unknown as StubData },
      },
    };
    const err = await handleRowWrite(event).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RosterUnavailableError);
    expect((err as Error).message).toContain('Server configuration missing.');
    expect(stub.has(PATH)).toBe(false);
  });
});

describe('projectRow', () => {
  it('shows a published final score with the override applied', async () => {
    const stub = makeStubFirestore({
      'gradebook_marks/qs1__u1': {
        ownerUid: 't1',
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
        ownerUid: 't1',
        comment: { text: 'private', shared: false, at: 1 },
        flags: ['missing'],
      },
    });
    await projectRow(
      stub.db as unknown as Db,
      row({ published: false, state: 'not-attempted', points: null }),
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
      'gradebook_marks/qs1__u1': {
        ownerUid: 't1',
        publishOverride: 'unpublished',
      },
    });
    await projectRow(stub.db as unknown as Db, row(), null, NOW);
    expect(entryOf(stub)).toMatchObject({ status: 'hidden', pct: null });
  });

  it('ignores a mark written by someone other than the teacher', async () => {
    const stub = makeStubFirestore({
      'gradebook_marks/qs1__u1': {
        ownerUid: 'intruder',
        override: { points: 0, at: 1 },
        publishOverride: 'unpublished',
      },
      'gradebook_columns/qs1': { ownerUid: 'intruder', maxPointsOverride: 100 },
    });
    await projectRow(stub.db as unknown as Db, row(), null, NOW);
    expect(entryOf(stub)).toMatchObject({
      status: 'scored',
      points: 8,
      pct: 80,
    });
  });

  it('hides teacher-only flags', async () => {
    const stub = makeStubFirestore({
      'gradebook_marks/qs1__u1': {
        ownerUid: 't1',
        flags: ['late'],
      },
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

  it('keeps the class standards when one entry goes', async () => {
    const stub = makeStubFirestore({
      'users/t1/gradebook_classes/r1': {
        configRef: { source: 'personal', configId: 'cfg1' },
      },
      'users/t1/gradebook_settings/cfg1': {
        studentVisibility: { standards: true },
        method: 'mean',
      },
      'grade_index/qs2__u1': row({ sessionId: 'qs2' }) as unknown as StubData,
    });
    const db = stub.db as unknown as Db;
    await projectRow(db, row(), null, NOW);
    await projectRow(db, row({ sessionId: 'qs2' }), null, NOW);
    await projectRow(db, null, row(), NOW);
    expect(Object.keys(stub.get(PATH)?.entries as object)).toEqual(['qs2']);
    expect(stub.get(PATH)?.standards).toEqual([
      {
        targetId: 'tgt',
        pct: 50,
        level: 2,
        evidence: [{ sessionId: 'qs2', pct: 50, at: NOW - DAY }],
      },
    ]);
  });

  it("never lets another owner replace a class's standards, scale or entries", async () => {
    const stub = makeStubFirestore({
      'users/t1/gradebook_classes/r1': {
        configRef: { source: 'personal', configId: 'cfg1' },
      },
      'users/t1/gradebook_settings/cfg1': {
        studentVisibility: { standards: true },
        method: 'mean',
      },
    });
    const db = stub.db as unknown as Db;
    await projectRow(db, row(), null, NOW);
    const before = stub.get(PATH);
    expect(before?.standards).not.toBeNull();
    // Teacher t2 projects into the same class, including under t1's session id.
    await projectRow(
      db,
      row({ ownerUid: 't2', sessionId: 'x1', rawPct: 100, points: 10 }),
      null,
      NOW + 1
    );
    await projectRow(
      db,
      row({ ownerUid: 't2', rawPct: 100, points: 10 }),
      null,
      NOW + 1
    );
    const after = stub.get(PATH);
    expect(after).toMatchObject({
      ownerUid: 't1',
      standards: before?.standards,
      levelNames: before?.levelNames,
      cutoffs: before?.cutoffs,
    });
    expect(entryOf(stub)).toEqual(
      (before?.entries as Record<string, StubData>).qs1
    );
    expect(entryOf(stub, 'x1')).toMatchObject({ ownerUid: 't2' });
  });

  it('lets a teacher update a legacy entry the doc-level owner did not write', async () => {
    const stub = makeStubFirestore({});
    const db = stub.db as unknown as Db;
    await projectRow(db, row(), null, NOW);
    const doc = stub.get(PATH) as { entries: Record<string, StubData> };
    const { ownerUid: _o, ...legacy } = doc.entries.qs1 as Record<
      string,
      unknown
    >;
    void _o;
    stub.store.set(PATH, {
      ...doc,
      ownerUid: 't2',
      entries: { qs1: legacy },
    });
    await projectRow(db, row(), null, NOW + 5000);
    expect(entryOf(stub)).toMatchObject({ ownerUid: 't1' });
  });

  it('keeps updatedAt for an entry stored before per-entry owners', async () => {
    const stub = makeStubFirestore({});
    const db = stub.db as unknown as Db;
    await projectRow(db, row(), null, NOW);
    const doc = stub.get(PATH) as { entries: Record<string, StubData> };
    const {
      ownerUid: _o,
      vouched: _v,
      ...legacy
    } = doc.entries.qs1 as Record<string, unknown>;
    void _o;
    void _v;
    stub.store.set(PATH, { ...doc, entries: { qs1: legacy } });
    await projectRow(db, row(), null, NOW + 5000);
    expect(entryOf(stub)).toMatchObject({ updatedAt: NOW, vouched: true });
  });

  it('stamps an owned but unstamped entry so a later sub swap keeps it', async () => {
    const stub = makeStubFirestore({});
    const db = stub.db as unknown as Db;
    await projectRow(db, row(), null, NOW);
    const doc = stub.get(PATH) as { entries: Record<string, StubData> };
    const { vouched: _v, ...unstamped } = doc.entries.qs1 as Record<
      string,
      unknown
    >;
    void _v;
    stub.store.set(PATH, { ...doc, entries: { qs1: unstamped } });
    await projectRow(db, row(), null, NOW + 5000, rosterOf('t1/c1/u1'));
    expect(entryOf(stub)).toEqual({ ...unstamped, vouched: true });
    await projectRow(db, row(), null, NOW + 6000, rosterOf());
    expect(entryOf(stub)).toEqual({ ...unstamped, vouched: true });
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
      'gradebook_marks/qs1__u1': {
        ownerUid: 't1',
        flags: ['late'],
      },
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
      {
        targetId: 'tgt',
        pct: 50,
        level: 2,
        evidence: [{ sessionId: 'qs1', pct: 50, at: NOW - DAY }],
      },
    ]);
    expect(stub.get(PATH)?.cutoffs).toEqual({
      proficient: 80,
      approaching: 60,
    });
    expect(stub.get(PATH)?.levelNames).toEqual([
      'Proficient',
      'Approaching',
      'Beginning',
    ]);
    expect(stub.get(PATH)?.levels).toEqual(DEFAULT_PROFICIENCY_SCALE.levels);
  });
});

describe('removeFlagsOnScore', () => {
  const marked = () =>
    makeStubFirestore({
      'gradebook_marks/qs1__u1': {
        ownerUid: 't1',
        flags: ['missing', 'incomplete'],
        suppressedAuto: [],
      },
    });

  it('drops Remove when scored flags on the first score and logs it', async () => {
    const stub = marked();
    await removeFlagsOnScore(
      stub.db as unknown as Db,
      'qs1__u1',
      row(),
      row({ state: 'not-attempted', points: null }),
      NOW
    );
    expect(stub.get('gradebook_marks/qs1__u1')?.flags).toEqual(['incomplete']);
    const hist = [...stub.store.entries()].filter(([p]) =>
      p.startsWith('gradebook_marks/qs1__u1/history/')
    );
    expect(hist.map(([, d]) => d)).toMatchObject([
      {
        ownerUid: 't1',
        byUid: 'system',
        field: 'flags',
        before: { flags: ['missing', 'incomplete'] },
        after: { flags: ['incomplete'] },
      },
    ]);
  });

  it('leaves flags alone when the row was already scored', async () => {
    const stub = marked();
    await removeFlagsOnScore(
      stub.db as unknown as Db,
      'qs1__u1',
      row(),
      row(),
      NOW
    );
    expect(stub.get('gradebook_marks/qs1__u1')?.flags).toEqual([
      'missing',
      'incomplete',
    ]);
  });
});

describe('triggers', () => {
  it('re-projects a row when its mark changes', async () => {
    const stub = makeStubFirestore({
      'admin_settings/gradebook_index': { enabled: true },
      'grade_index/quiz__qs1__u1': row() as unknown as StubData,
      'gradebook_marks/qs1__u1': {
        ownerUid: 't1',
        sessionId: 'qs1',
        studentUid: 'u1',
        comment: { text: 'See me', shared: true, at: 1 },
      },
    });
    vi.mocked(admin.firestore).mockReturnValue(stub.db as never);
    await (gradeIndexMark as unknown as Handler)({
      params: { markId: 'qs1__u1' },
      data: {
        after: {
          exists: true,
          data: () => ({ ownerUid: 't1', sessionId: 'qs1', studentUid: 'u1' }),
        },
      },
    } as { params: Record<string, string> });
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

  it('queues the session when a student write fails', async () => {
    const stub = makeStubFirestore({
      'admin_settings/gradebook_index': { enabled: true },
      'quiz_sessions/qs1': { teacherUid: 't1' },
    });
    const db = stub.db as unknown as { collection: (n: string) => unknown };
    const collection = db.collection.bind(db);
    db.collection = (name: string) => {
      if (name === 'users') throw new Error('unavailable');
      return collection(name);
    };
    vi.mocked(admin.firestore).mockReturnValue(stub.db as never);
    const response = { studentUid: 'u1', status: 'completed', submittedAt: 1 };
    stub.store.set('quiz_sessions/qs1/responses/u1', response);
    await handleStudentDocWrite('quiz', {
      params: { sessionId: 'qs1', docId: 'u1' },
      data: {
        before: { exists: false, data: () => undefined },
        after: { exists: true, data: () => response },
      },
    });
    expect(stub.get('grade_index_sessions/quiz__qs1')).toMatchObject({
      kind: 'quiz',
    });
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
    expect(stub.get('grade_index_sessions/quiz__qs1')).toMatchObject({
      kind: 'quiz',
    });
  });
});

describe('side-doc ownership', () => {
  const sideEvent = {
    params: {},
    data: {
      before: { exists: false, data: () => undefined },
      after: { exists: true, data: () => ({ stepTargets: [1] }) },
    },
  };
  const run = async (
    docs: StubData,
    ownerUid: string
  ): Promise<ReturnType<typeof makeStubFirestore>> => {
    const stub = makeStubFirestore({
      'admin_settings/gradebook_index': { enabled: true },
      ...docs,
    });
    vi.mocked(admin.firestore).mockReturnValue(stub.db as never);
    await handleSideDocWrite('quiz', 'qs1', sideEvent, null, ownerUid);
    return stub;
  };

  it('queues when the writer owns the session', async () => {
    const stub = await run({ 'quiz_sessions/qs1': { teacherUid: 't1' } }, 't1');
    expect(stub.has('grade_index_sessions/quiz__qs1')).toBe(true);
  });

  it('ignores a non-owner and a missing session', async () => {
    const other = await run({ 'quiz_sessions/qs1': { teacherUid: 't1' } }, 'x');
    expect(other.has('grade_index_sessions/quiz__qs1')).toBe(false);
    const missing = await run({}, 'x');
    expect(missing.has('grade_index_sessions/quiz__qs1')).toBe(false);
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
