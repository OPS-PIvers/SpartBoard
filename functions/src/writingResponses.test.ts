/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory store rows. */
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

import { fakeFirestore, SERVER_TS } from './writingTestFakes';
import {
  handleOpenWriting,
  handleReturnWriting,
  handleSaveWritingFeedback,
  handleTakeBackWriting,
  handleTimedTurnIn,
  handleTurnInWriting,
  writingCallerFrom,
  type WritingCaller,
} from './writingResponses';

const SID = 's1';
const SESSION = `writing_assignment_sessions/${SID}`;
const RESP = `${SESSION}/responses/stu1`;
const store = new Map<string, any>();
const db = fakeFirestore(store);

const student: WritingCaller = { uid: 'stu1', student: true, classIds: ['c1'] };
const outsider: WritingCaller = {
  uid: 'stu9',
  student: true,
  classIds: ['c9'],
};
const teacher: WritingCaller = { uid: 't1', student: false, classIds: [] };

const open = (now = 1_000, caller = student) =>
  handleOpenWriting(db, caller, { sessionId: SID, tabId: 'tabA' }, now);
const turnIn = (data: object = {}, now = 2_000) =>
  handleTurnInWriting(db, student, { sessionId: SID, tabId: 'tabA', ...data }, now);
const takeBack = (now = 3_000) =>
  handleTakeBackWriting(db, student, { sessionId: SID }, now);
const ret = (revise: boolean, data: object = {}, caller = teacher) =>
  handleReturnWriting(
    db,
    caller,
    { sessionId: SID, studentUid: 'stu1', ...data },
    4_000,
    revise
  );
const feedback = (draftId = '1', fb: object = { overallComment: 'Good' }) =>
  handleSaveWritingFeedback(
    db,
    teacher,
    { sessionId: SID, studentUid: 'stu1', draftId, feedback: fb },
    5_000
  );

beforeEach(() => {
  store.clear();
  store.set(SESSION, {
    teacherUid: 't1',
    classIds: ['c1'],
    status: 'active',
    dueAt: 10_000,
    grading: { mode: 'points', points: 10 },
  });
});

describe('openWritingV1', () => {
  it('creates a draft response with the holding tab', async () => {
    await expect(open()).resolves.toEqual({
      created: true,
      status: 'draft',
      saveCount: 0,
      deadlineAt: null,
    });
    expect(store.get(RESP)).toMatchObject({
      studentUid: 'stu1',
      classId: 'c1',
      status: 'draft',
      saveCount: 0,
      tabId: 'tabA',
      tabAt: SERVER_TS,
      logChunk: 0,
      draftCount: 0,
    });
  });

  it('returns the existing response instead of resetting it', async () => {
    await open();
    store.set(RESP, { ...store.get(RESP), saveCount: 7, html: '<p>x</p>' });
    await expect(open(9_000)).resolves.toMatchObject({
      created: false,
      saveCount: 7,
    });
    expect(store.get(RESP).html).toBe('<p>x</p>');
  });

  it('refuses a student outside the classes with no pointer', async () => {
    await expect(open(1_000, outsider)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('admits a picked student through their pointer, but not an excluded one', async () => {
    store.set('student_assignments/stu9/items/s1', { classId: 'c9' });
    await expect(open(1_000, outsider)).resolves.toMatchObject({
      created: true,
    });
    store.delete(`${SESSION}/responses/stu9`);
    store.set('student_assignments/stu9/items/s1', { excluded: true });
    await expect(open(1_000, outsider)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('refuses teachers and PIN sign-ins (D20)', async () => {
    await expect(open(1_000, teacher)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('starts the clock on timed work, with the pointer extra time', async () => {
    store.set(SESSION, { ...store.get(SESSION), timeLimitMinutes: 10 });
    store.set('student_assignments/stu1/items/s1', {
      override: { timeMultiplier: 1.5 },
    });
    await expect(open(1_000)).resolves.toMatchObject({
      deadlineAt: 1_000 + 900_000,
    });
    expect(store.get(RESP).timerStartedAt).toBe(1_000);
  });

  it('refuses a closed or ended session', async () => {
    store.set(SESSION, { ...store.get(SESSION), closeAt: 0 });
    await expect(open(500_000)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    store.set(SESSION, { ...store.get(SESSION), closeAt: null, status: 'ended' });
    await expect(open()).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('turnInWritingV1', () => {
  beforeEach(async () => {
    await open();
    store.set(RESP, { ...store.get(RESP), html: '<p>one two</p>', saveCount: 3 });
  });

  it('freezes a copy and locks the piece', async () => {
    await expect(turnIn()).resolves.toEqual({
      status: 'turned-in',
      draftCount: 1,
    });
    expect(store.get(`${RESP}/drafts/1`)).toMatchObject({
      number: 1,
      html: '<p>one two</p>',
      turnedInBy: 'student',
      logMark: { chunk: 0, length: 0 },
    });
    expect(store.get(RESP)).toMatchObject({
      status: 'turned-in',
      latestDraftId: '1',
      turnedInAt: 2_000,
    });
  });

  it('takes a fresh final flush from the holding tab', async () => {
    await turnIn({ html: '<p>a b c</p>', saveCount: 4, summary: { awayMs: 9 } });
    expect(store.get(RESP)).toMatchObject({ html: '<p>a b c</p>', saveCount: 4 });
    expect(store.get(`${RESP}/drafts/1`).summary).toMatchObject({
      wordCount: 3,
      awayMs: 9,
    });
  });

  it('refuses a stale tab or a stale save (D23, D24)', async () => {
    await expect(turnIn({ tabId: 'tabB' })).rejects.toMatchObject({
      details: { reason: 'stale-tab' },
    });
    await expect(turnIn({ html: '<p>x</p>', saveCount: 3 })).rejects.toMatchObject(
      { details: { reason: 'stale-save' } }
    );
  });

  it('refuses a second turn in and enforced word limits', async () => {
    await turnIn();
    await expect(turnIn()).rejects.toMatchObject({
      details: { reason: 'locked' },
    });
    store.set(RESP, { ...store.get(RESP), status: 'draft' });
    store.set(SESSION, {
      ...store.get(SESSION),
      minWords: 5,
      enforceWordLimit: true,
    });
    await expect(turnIn()).rejects.toMatchObject({
      details: { reason: 'too-short' },
    });
  });

  it('records where the log stood', async () => {
    store.set(`${RESP}/log/0`, { log: 'abcdef', closed: false });
    await turnIn();
    expect(store.get(`${RESP}/drafts/1`).logMark).toEqual({
      chunk: 0,
      length: 6,
    });
  });
});

describe('takeBackWritingV1', () => {
  beforeEach(async () => {
    await open();
    await turnIn();
  });

  it('discards the copy and unlocks the draft', async () => {
    await expect(takeBack()).resolves.toEqual({
      status: 'draft',
      draftCount: 0,
    });
    expect(store.has(`${RESP}/drafts/1`)).toBe(false);
    expect(store.get(RESP).turnedInAt).toBeUndefined();
  });

  it('refuses once the teacher saved feedback', async () => {
    await feedback();
    await expect(takeBack()).rejects.toMatchObject({
      details: { reason: 'feedback' },
    });
    expect(store.has(`${RESP}/drafts/1`)).toBe(true);
  });

  it('refuses past the due date, and uses the class due date', async () => {
    await expect(takeBack(10_001)).rejects.toMatchObject({
      details: { reason: 'past-due' },
    });
    store.set(SESSION, {
      ...store.get(SESSION),
      dueAtByClassId: { c1: 20_000 },
    });
    await expect(takeBack(15_000)).resolves.toMatchObject({ status: 'draft' });
  });

  it('refuses timed work', async () => {
    store.set(SESSION, { ...store.get(SESSION), timeLimitMinutes: 5 });
    await expect(takeBack()).rejects.toMatchObject({
      details: { reason: 'timed' },
    });
  });

  it('goes back to revising when an earlier draft stays', async () => {
    await ret(true);
    store.set(RESP, { ...store.get(RESP), saveCount: 9 });
    await turnIn();
    await expect(takeBack()).resolves.toEqual({
      status: 'revising',
      draftCount: 1,
    });
    expect(store.get(RESP).latestDraftId).toBe('1');
  });
});

describe('return and return for revision', () => {
  beforeEach(async () => {
    await open();
    await turnIn();
  });

  it('Return keeps it locked and stamps the copy', async () => {
    await expect(ret(false)).resolves.toMatchObject({ status: 'returned' });
    expect(store.get(`${RESP}/drafts/1`)).toMatchObject({
      returnedAt: 4_000,
      returnKind: 'return',
    });
  });

  it('Return for revision unlocks it, and either repeats', async () => {
    await ret(false);
    await expect(ret(false)).resolves.toMatchObject({ status: 'returned' });
    await expect(ret(true)).resolves.toMatchObject({ status: 'revising' });
    await expect(ret(true)).resolves.toMatchObject({ status: 'revising' });
    await expect(ret(false)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('can change whether students see their record (D11)', async () => {
    await ret(false, { studentCanViewRecord: true });
    expect(store.get(SESSION).studentCanViewRecord).toBe(true);
  });

  it('refuses anyone but the session teacher', async () => {
    await expect(
      ret(false, {}, { uid: 't2', student: false, classIds: [] })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(ret(false, {}, student)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('refuses a draft that was taken back', async () => {
    await takeBack();
    await expect(ret(false)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});

describe('saveWritingFeedbackV1', () => {
  beforeEach(async () => {
    await open();
    await turnIn();
  });

  it('writes feedback onto the copy and the counting grade', async () => {
    await expect(feedback('1', { pointsAwarded: 8 })).resolves.toEqual({
      draftId: '1',
      counts: true,
    });
    expect(store.get(`${RESP}/drafts/1`).feedback).toMatchObject({
      pointsAwarded: 8,
      gradedBy: 't1',
    });
    expect(store.get(RESP).grade).toMatchObject({
      draftId: '1',
      pointsAwarded: 8,
      maxPoints: 10,
    });
  });

  it('is refused, never recreated, once the copy was taken back', async () => {
    await takeBack();
    await expect(feedback()).rejects.toMatchObject({
      details: { reason: 'taken-back' },
    });
    expect(store.has(`${RESP}/drafts/1`)).toBe(false);
  });

  it('refuses points over the total', async () => {
    await expect(feedback('1', { pointsAwarded: 11 })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('keeps the latest graded draft counting (D14)', async () => {
    await ret(true);
    store.set(RESP, { ...store.get(RESP), saveCount: 9 });
    await turnIn();
    await feedback('2', { pointsAwarded: 9 });
    await expect(feedback('1', { pointsAwarded: 2 })).resolves.toMatchObject({
      counts: false,
    });
    expect(store.get(RESP).grade).toMatchObject({
      draftId: '2',
      pointsAwarded: 9,
    });
    expect(store.get(`${RESP}/drafts/1`).feedback.pointsAwarded).toBe(2);
  });
});

describe('turnInTimedWritingV1', () => {
  beforeEach(async () => {
    store.set(SESSION, { ...store.get(SESSION), timeLimitMinutes: 1 });
    await open(0);
  });
  const timed = (now: number, caller: WritingCaller, data: object = {}) =>
    handleTimedTurnIn(db, caller, { sessionId: SID, ...data }, now);

  it('waits for the clock', async () => {
    await expect(timed(30_000, student)).rejects.toMatchObject({
      details: { reason: 'early' },
    });
  });

  it('the holding tab turns it in with its last text', async () => {
    await expect(
      timed(60_000, student, { tabId: 'tabA', html: '<p>end</p>', saveCount: 1 })
    ).resolves.toEqual({ status: 'turned-in', draftCount: 1 });
    expect(store.get(`${RESP}/drafts/1`)).toMatchObject({
      html: '<p>end</p>',
      turnedInBy: 'timer',
    });
  });

  it('past the flush grace it freezes the saved text', async () => {
    store.set(RESP, { ...store.get(RESP), html: '<p>saved</p>' });
    await timed(200_000, student, {
      tabId: 'tabA',
      html: '<p>late</p>',
      saveCount: 1,
    });
    expect(store.get(`${RESP}/drafts/1`).html).toBe('<p>saved</p>');
  });

  it('the teacher can turn it in once time is up; repeats are no-ops', async () => {
    await expect(
      timed(61_000, teacher, { studentUid: 'stu1' })
    ).resolves.toMatchObject({ status: 'turned-in' });
    await expect(
      timed(62_000, teacher, { studentUid: 'stu1' })
    ).resolves.toMatchObject({ status: 'turned-in', draftCount: 1 });
  });

  it('refuses untimed work', async () => {
    store.set(RESP, { ...store.get(RESP), deadlineAt: undefined });
    delete store.get(RESP).deadlineAt;
    await expect(timed(61_000, student)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});

describe('writingCallerFrom', () => {
  it('treats PIN and anonymous sign-ins as non-students or refuses them', () => {
    expect(
      writingCallerFrom({
        uid: 'u',
        token: { studentRole: true, pinLogin: true, classIds: ['c1'] },
      } as any)
    ).toMatchObject({ student: false });
    expect(() =>
      writingCallerFrom({
        uid: 'u',
        token: { firebase: { sign_in_provider: 'anonymous' } },
      } as any)
    ).toThrow();
    expect(writingCallerFrom(undefined)).toBeNull();
  });
});
