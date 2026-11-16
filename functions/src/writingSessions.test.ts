/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory store rows. */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./functionsInit', () => ({}));
vi.mock('./firebaseAdmin', () => ({ firestore: () => ({}) }));

import { fakeFirestore } from './writingTestFakes';
import {
  deleteWritingSessionData,
  handleAssignWriting,
  handleDeleteWritingSession,
  handleEndWritingSession,
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
    expect(snapshotLibraryItem({ grading: { mode: 'points' } }).grading).toEqual(
      { mode: 'ungraded' }
    );
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
      handleDeleteWritingSession(db, { uid: 't2', staff: true }, { sessionId: 'S1' })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      handleDeleteWritingSession(db, teacher, { sessionId: 'S1' })
    ).resolves.toEqual({ deleted: true });
    expect(store.has('writing_assignment_sessions/S1')).toBe(false);
    expect(store.has('users/t1/writing_assignment_records/S1')).toBe(false);
  });

  it('only the owner ends; the session and record move to ended once', async () => {
    await expect(
      handleEndWritingSession(db, { uid: 't2', staff: true }, { sessionId: 'S1' }, 5)
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
    expect(
      [...store.keys()].filter((k) => k.includes('/responses/'))
    ).toEqual([]);
  });
});
