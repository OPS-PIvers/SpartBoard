/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- in-memory store rows. */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./functionsInit', () => ({}));
vi.mock('./firebaseAdmin', () => ({ firestore: () => ({}) }));
vi.mock('firebase-admin/firestore', async () => {
  const fakes = await import('./writingTestFakes');
  return {
    FieldValue: {
      delete: () => fakes.DELETE,
      serverTimestamp: () => fakes.SERVER_TS,
    },
  };
});

import { fakeFirestore } from './writingTestFakes';
import {
  deleteWritingSessionData,
  handleAssignWriting,
  handleDeleteWritingSession,
  handleEndWritingSession,
  handleUpdateWritingSession,
  sessionSettings,
  snapshotLibraryItem,
} from './writingSessions';

const store = new Map<string, any>();
const db = fakeFirestore(store);
const teacher = { uid: 't1', staff: true };
const ITEM = 'users/t1/writing_assignments/w1';
const rubric = { id: 'r1', title: 'R', criteria: [] };

beforeEach(() => {
  store.clear();
  store.set(ITEM, {
    id: 'w1',
    title: 'Narrative',
    prompt: '<p>Write.</p>',
    stimuli: [{ id: 's', kind: 'text' }],
    minWords: 100,
    maxWords: 500,
    enforceWordLimit: true,
    grading: { mode: 'rubric', rubricId: 'r1', rubricSnapshot: rubric },
    folderId: 'f1',
    order: 3,
  });
});

const assign = (data: object, caller: any = teacher) =>
  handleAssignWriting(db, caller, { itemId: 'w1', ...data }, 1_000, () => 'S1');

describe('assignWritingV1', () => {
  it('snapshots the item and the settings onto the session and the record', async () => {
    await expect(
      assign({
        classIds: ['c1', 'c2'],
        periodNames: ['P1'],
        rosterIds: ['r1'],
        dueAt: 9_000,
        dueAtByClassId: { c2: 9_500, bad: 'x' },
        timeLimitMinutes: 40,
      })
    ).resolves.toEqual({ sessionId: 'S1' });
    const session = store.get('writing_assignment_sessions/S1');
    expect(session).toMatchObject({
      id: 'S1',
      teacherUid: 't1',
      itemId: 'w1',
      title: 'Narrative',
      prompt: '<p>Write.</p>',
      minWords: 100,
      maxWords: 500,
      enforceWordLimit: true,
      grading: { mode: 'rubric', rubricId: 'r1', rubricSnapshot: rubric },
      allowPaste: false,
      recordingNotice: true,
      studentCanViewRecord: false,
      spellCheck: true,
      timeLimitMinutes: 40,
      tabWarningsEnabled: true,
      classIds: ['c1', 'c2'],
      classId: 'c1',
      status: 'active',
      dueAt: 9_000,
      dueAtByClassId: { c2: 9_500 },
      workKind: 'work',
    });
    expect(session.folderId).toBeUndefined();
    expect(store.get('users/t1/writing_assignment_records/S1')).toMatchObject({
      sessionId: 'S1',
      title: 'Narrative',
      timeLimitMinutes: 40,
      classIds: ['c1', 'c2'],
    });
  });

  it('refuses a non-teacher and a missing item', async () => {
    await expect(assign({}, { uid: 's', staff: false })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(assign({ itemId: 'nope' })).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(assign({}, null)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('refuses a class missing from the teacher verified list and writes nothing', async () => {
    store.set('verified_classes/t1', { ids: ['c1'], classlinkAt: 1 });
    await expect(assign({ classIds: ['c1', 'c2'] })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(store.has('writing_assignment_sessions/S1')).toBe(false);
    await expect(assign({ classIds: ['c1'] })).resolves.toEqual({
      sessionId: 'S1',
    });
  });
});

describe('sessionSettings', () => {
  it('defaults: paste off, notice on, record hidden, spell check on, no limit', () => {
    expect(sessionSettings({})).toEqual({
      allowPaste: false,
      recordingNotice: true,
      studentCanViewRecord: false,
      spellCheck: true,
      tabWarningsEnabled: true,
    });
  });
  it('clamps the time limit and the away limit', () => {
    expect(
      sessionSettings({
        timeLimitMinutes: 10_000,
        tabAwayLimitSeconds: 1,
        focusLevel: 'lock',
        blockPrint: true,
      })
    ).toMatchObject({
      timeLimitMinutes: 600,
      tabAwayLimitSeconds: 5,
      focusLevel: 'lock',
      blockPrint: true,
    });
  });
});

describe('snapshotLibraryItem', () => {
  it('falls back to ungraded on a malformed grading', () => {
    expect(
      snapshotLibraryItem({ grading: { mode: 'points' } }).grading
    ).toEqual({ mode: 'ungraded' });
  });
});

describe('delete and cleanup', () => {
  beforeEach(async () => {
    await assign({ classIds: ['c1'] });
    const r = 'writing_assignment_sessions/S1/responses/u1';
    store.set(r, { status: 'draft' });
    store.set(`${r}/log/0`, { log: 'x', closed: true });
    store.set(`${r}/drafts/1`, { html: 'x' });
  });

  it('only the owner deletes; the session and record go', async () => {
    await expect(
      handleDeleteWritingSession(
        db,
        { uid: 't2', staff: true },
        { sessionId: 'S1' }
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      handleDeleteWritingSession(db, teacher, { sessionId: 'S1' })
    ).resolves.toEqual({ deleted: true });
    expect(store.has('writing_assignment_sessions/S1')).toBe(false);
    expect(store.has('users/t1/writing_assignment_records/S1')).toBe(false);
  });

  it('only the owner ends; the session and record move to ended once', async () => {
    await expect(
      handleEndWritingSession(
        db,
        { uid: 't2', staff: true },
        { sessionId: 'S1' },
        5
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      handleEndWritingSession(db, teacher, { sessionId: 'S1' }, 5)
    ).resolves.toEqual({ ended: true });
    expect(store.get('writing_assignment_sessions/S1')).toMatchObject({
      status: 'ended',
      endedAt: 5,
    });
    expect(store.get('users/t1/writing_assignment_records/S1')).toMatchObject({
      status: 'ended',
      endedAt: 5,
      title: 'Narrative',
    });
    await expect(
      handleEndWritingSession(db, teacher, { sessionId: 'S1' }, 6)
    ).resolves.toEqual({ ended: false });
  });

  it('the trigger removes responses, frozen copies and log chunks (D21)', async () => {
    await deleteWritingSessionData(db, 'S1');
    expect([...store.keys()].filter((k) => k.includes('/responses/'))).toEqual(
      []
    );
  });
});

describe('Manual assign and updateWritingSessionV1', () => {
  const SESSION = 'writing_assignment_sessions/S1';
  const RECORD = 'users/t1/writing_assignment_records/S1';
  const gate = {
    c1: {
      state: 'paused',
      openAt: null,
      closeAt: 9_000,
      bellPeriodId: null,
      verified: true,
      label: 'P1',
      rosterId: 'r1',
    },
  };
  const update = (data: object, caller: any = teacher) =>
    handleUpdateWritingSession(db, caller, { sessionId: 'S1', ...data }, 7);

  beforeEach(async () => {
    await assign({
      classIds: ['c1'],
      accessMode: 'assessment',
      periodAccess: { ...gate, 'bad/key': gate.c1, c2: { state: 'nope' } },
      dueLocks: true,
      dueAt: 9_000,
    });
  });

  it('stores the paused class gate on the session and the record', () => {
    for (const path of [SESSION, RECORD])
      expect(store.get(path)).toMatchObject({
        accessMode: 'assessment',
        periodAccess: gate,
        dueLocks: true,
      });
    expect(Object.keys(store.get(SESSION).periodAccess)).toEqual(['c1']);
  });

  it('starts and pauses a class on both docs, ignoring unknown classes and fields', async () => {
    await expect(
      update({
        periodAccess: {
          c1: { state: 'open', openAt: null, closeAt: 8_000, label: 'hacked' },
          c9: { state: 'open' },
        },
      })
    ).resolves.toEqual({ updated: true, assignedTab: true });
    for (const path of [SESSION, RECORD]) {
      expect(store.get(path).periodAccess.c1).toMatchObject({
        state: 'open',
        closeAt: 8_000,
        label: 'P1',
      });
      expect(store.get(path).periodAccess.c9).toBeUndefined();
    }
  });

  it('closes and reopens a class with its closedAt mark on both docs', async () => {
    await update({
      periodAccess: {
        c1: { state: 'closed', closedAt: 5_000, pausedAt: 5_000 },
      },
    });
    for (const path of [SESSION, RECORD])
      expect(store.get(path).periodAccess.c1).toMatchObject({
        state: 'closed',
        closedAt: 5_000,
      });
    await update({ periodAccess: { c1: { state: 'open', closedAt: null } } });
    for (const path of [SESSION, RECORD])
      expect(store.get(path).periodAccess.c1).toMatchObject({
        state: 'open',
        closedAt: null,
      });
  });

  it('lets a student in on the session only', async () => {
    await update({ studentAccess: { stu1: 50_000, 'a/b': 1 } });
    expect(store.get(SESSION).studentAccess).toEqual({ stu1: 50_000 });
    expect(store.get(RECORD).studentAccess).toBeUndefined();
  });

  it('applies the hub edit: window on both, targeting siblings on the record', async () => {
    store.set(RECORD, {
      ...store.get(RECORD),
      overridesBySourcedId: { 'classlink:a': { extraTimeMultiplier: 1.5 } },
      removedStudentRefs: [{ kind: 'classlink', sourcedId: 'x' }],
    });
    await update({
      window: { closeAt: 6_000, dueAt: null },
      record: {
        targetGroupIds: ['g1'],
        overrides: {
          'classlink:a': null,
          'classlink:b': { timeMultiplier: 2 },
          bogus: {},
        },
        excludedTargets: [
          { kind: 'classlink', sourcedId: 'z' },
          { kind: 'nope' },
        ],
        targetSkippedCount: 2,
        removedStudentRefs: [
          { kind: 'classlink', sourcedId: 'x' },
          { kind: 'classlink', sourcedId: 'y' },
        ],
      },
    });
    expect(store.get(SESSION)).toMatchObject({ closeAt: 6_000, dueAt: null });
    expect(store.get(SESSION).targetGroupIds).toBeUndefined();
    const record = store.get(RECORD);
    expect(record).toMatchObject({
      closeAt: 6_000,
      dueAt: null,
      targetGroupIds: ['g1'],
      excludedTargets: [{ kind: 'classlink', sourcedId: 'z' }],
      targetSkippedCount: 2,
    });
    expect(Object.keys(record.overridesBySourcedId)).toEqual(['classlink:b']);
    expect(record.removedStudentRefs).toHaveLength(2);
  });

  it('ends the session when the last class closes, and only then', async () => {
    store.set(SESSION, {
      ...store.get(SESSION),
      periodAccess: { ...store.get(SESSION).periodAccess, c2: gate.c1 },
    });
    const closed = { state: 'closed', closedAt: 5, pausedAt: 5 };
    await update({ periodAccess: { c1: closed }, endIfAllClosed: true });
    expect(store.get(SESSION).status).toBe('active');
    await update({ periodAccess: { c2: closed }, endIfAllClosed: true });
    for (const path of [SESSION, RECORD])
      expect(store.get(path)).toMatchObject({ status: 'ended', endedAt: 7 });
  });

  it('a Ready class (closed with no mark) keeps the session open', async () => {
    store.set(SESSION, {
      ...store.get(SESSION),
      periodAccess: {
        c1: { ...gate.c1, state: 'closed' },
        c2: { ...gate.c1, state: 'closed', closedAt: 4 },
      },
    });
    await update({ endIfAllClosed: true });
    expect(store.get(SESSION).status).toBe('active');
  });

  it('reopens an ended session and clears the record marks', async () => {
    await update({ end: true, marks: { closedAt: 5, doneAt: 6 } });
    expect(store.get(RECORD)).toMatchObject({
      status: 'ended',
      closedAt: 5,
      doneAt: 6,
    });
    await update({
      reopen: true,
      periodAccess: { c1: { state: 'open', closedAt: null } },
    });
    for (const path of [SESSION, RECORD]) {
      expect(store.get(path).status).toBe('active');
      expect(store.get(path).endedAt).toBeUndefined();
      expect(store.get(path).periodAccess.c1.state).toBe('open');
    }
    expect(store.get(RECORD)).toMatchObject({ closedAt: null, doneAt: null });
    expect(store.get(SESSION).closedAt).toBeUndefined();
  });

  it('a reopen of a live session and an end of an ended one change nothing', async () => {
    await expect(update({ reopen: true })).resolves.toEqual({
      updated: false,
      assignedTab: true,
    });
    await update({ end: true });
    store.set(SESSION, { ...store.get(SESSION), endedAt: 1 });
    await update({ end: true, marks: { doneAt: 9 } });
    expect(store.get(SESSION).endedAt).toBe(1);
    expect(store.get(RECORD).doneAt).toBe(9);
  });

  it('ignores marks that are not an object', async () => {
    await expect(update({ marks: 'x' })).resolves.toMatchObject({
      updated: false,
    });
  });

  it('refuses anyone but the session teacher', async () => {
    await expect(update({}, { uid: 't2', staff: true })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(update({}, { uid: 't1', staff: false })).rejects.toMatchObject(
      {
        code: 'permission-denied',
      }
    );
  });
});
