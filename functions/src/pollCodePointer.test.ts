import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_opts: unknown, handler: unknown) => handler,
}));

import { codeOfSessionId, handlePollSessionWrite } from './pollCodePointer';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

type Db = Parameters<typeof handlePollSessionWrite>[0];

const change = (after: StubData | undefined) => ({
  before: { exists: false, data: () => undefined },
  after: { exists: !!after, data: () => after },
});

const live = (uid: string, over: StubData = {}): StubData => ({
  teacherUid: uid,
  code: 'ABCDE',
  questions: [{ id: 'q1' }],
  active: true,
  updatedAt: 10,
  ...over,
});

const run = async (
  seed: Record<string, StubData>,
  id: string,
  after?: StubData
) => {
  const stored = after ? { [`poll_sessions/${id}`]: after } : {};
  const stub = makeStubFirestore({ ...stored, ...seed });
  await handlePollSessionWrite(stub.db as unknown as Db, id, change(after));
  return stub.store.get('poll_codes/ABCDE');
};

describe('pollCodePointer', () => {
  it('reads the code from the session id', () => {
    expect(codeOfSessionId('t1_ABCDE')).toBe('ABCDE');
    expect(codeOfSessionId('ABCDE')).toBeNull();
    expect(codeOfSessionId('t1_bad code')).toBeNull();
  });

  it('points a new code at the session, whichever client wrote it', async () => {
    const ptr = await run({}, 't1_ABCDE', live('t1', { active: false }));
    expect(ptr).toMatchObject({ sessionId: 't1_ABCDE', teacherUid: 't1' });
  });

  it("moves a reserved code to a Synced-board member's live session", async () => {
    const ptr = await run(
      {
        'poll_codes/ABCDE': {
          sessionId: 'tA_ABCDE',
          teacherUid: 'tA',
          memberUids: ['tA', 'tB'],
        },
        'poll_sessions/tA_ABCDE': live('tA', { active: false }),
      },
      'tB_ABCDE',
      live('tB')
    );
    expect(ptr).toMatchObject({
      sessionId: 'tB_ABCDE',
      teacherUid: 'tB',
      memberUids: ['tA', 'tB'],
    });
  });

  it('moves the code back to its first holder after a colleague ran it', async () => {
    const ptr = await run(
      {
        'poll_codes/ABCDE': {
          sessionId: 'tB_ABCDE',
          teacherUid: 'tB',
          memberUids: ['tA', 'tB'],
        },
        'poll_sessions/tB_ABCDE': live('tB', { active: false }),
      },
      'tA_ABCDE',
      live('tA')
    );
    expect(ptr).toMatchObject({ sessionId: 'tA_ABCDE', teacherUid: 'tA' });
  });

  it("never moves an idle teacher's code to a teacher the server has not checked", async () => {
    const ptr = await run(
      {
        'poll_codes/ABCDE': {
          sessionId: 'tA_ABCDE',
          teacherUid: 'tA',
          updatedAt: Date.now(),
        },
        'poll_sessions/tA_ABCDE': live('tA', { active: false }),
      },
      'tX_ABCDE',
      live('tX', { updatedAt: 99 })
    );
    expect(ptr).toMatchObject({ sessionId: 'tA_ABCDE', teacherUid: 'tA' });
  });

  it("keeps a fresh reservation from another teacher's session", async () => {
    const ptr = await run(
      {
        'poll_codes/ABCDE': {
          sessionId: 'tA_ABCDE',
          teacherUid: 'tA',
          reservedAt: Date.now(),
        },
      },
      'tX_ABCDE',
      live('tX')
    );
    expect(ptr).toMatchObject({ sessionId: 'tA_ABCDE' });
  });

  it('lets any teacher take a reservation whose session never appeared', async () => {
    const ptr = await run(
      {
        'poll_codes/ABCDE': {
          sessionId: 'tA_ABCDE',
          teacherUid: 'tA',
          reservedAt: Date.now() - 16 * 60 * 1000,
        },
      },
      'tX_ABCDE',
      live('tX')
    );
    expect(ptr).toMatchObject({ sessionId: 'tX_ABCDE', teacherUid: 'tX' });
    expect(ptr).not.toHaveProperty('memberUids');
  });

  it("never takes a code from another teacher's live session", async () => {
    const ptr = await run(
      {
        'poll_codes/ABCDE': { sessionId: 'tA_ABCDE', teacherUid: 'tA' },
        'poll_sessions/tA_ABCDE': live('tA'),
      },
      'tB_ABCDE',
      live('tB', { updatedAt: 99 })
    );
    expect(ptr).toMatchObject({ sessionId: 'tA_ABCDE' });
  });

  it('ignores a session whose code field disagrees with its id', async () => {
    const ptr = await run({}, 'tB_ZZZZZ', live('tB', { code: 'ABCDE' }));
    expect(ptr).toBeUndefined();
  });

  it('drops the pointer when its session is retired', async () => {
    const ptr = await run(
      { 'poll_codes/ABCDE': { sessionId: 't1_ABCDE', teacherUid: 't1' } },
      't1_ABCDE',
      live('t1', { active: false, questions: [] })
    );
    expect(ptr).toBeUndefined();
  });

  it('hands the code to a live rival when the holder retires', async () => {
    const ptr = await run(
      {
        'poll_codes/ABCDE': {
          sessionId: 'tA_ABCDE',
          teacherUid: 'tA',
          memberUids: ['tB'],
        },
        'poll_sessions/tA_ABCDE': live('tA', { active: false, questions: [] }),
        'poll_sessions/tB_ABCDE': live('tB'),
      },
      'tA_ABCDE'
    );
    expect(ptr).toMatchObject({ sessionId: 'tB_ABCDE', teacherUid: 'tB' });
  });

  it('hands the code to a live rival when the holder goes inactive', async () => {
    const ptr = await run(
      {
        'poll_codes/ABCDE': {
          sessionId: 'tA_ABCDE',
          teacherUid: 'tA',
          memberUids: ['tB'],
        },
        'poll_sessions/tA_ABCDE': live('tA', { active: false }),
        'poll_sessions/tB_ABCDE': live('tB'),
      },
      'tA_ABCDE'
    );
    expect(ptr).toMatchObject({ sessionId: 'tB_ABCDE' });
  });

  it('never hands the code to a live rival the server has not checked', async () => {
    const ptr = await run(
      {
        'poll_codes/ABCDE': { sessionId: 'tA_ABCDE', teacherUid: 'tA' },
        'poll_sessions/tA_ABCDE': live('tA', { active: false, questions: [] }),
        'poll_sessions/tX_ABCDE': live('tX'),
      },
      'tA_ABCDE'
    );
    expect(ptr).toBeUndefined();
  });

  it('keeps the pointer on an active holder', async () => {
    const ptr = await run(
      {
        'poll_codes/ABCDE': { sessionId: 'tA_ABCDE', teacherUid: 'tA' },
        'poll_sessions/tA_ABCDE': live('tA'),
        'poll_sessions/tB_ABCDE': live('tB', { updatedAt: 99 }),
      },
      'tA_ABCDE'
    );
    expect(ptr).toMatchObject({ sessionId: 'tA_ABCDE' });
  });

  it('skips retired and other-code rivals, and clears when none are left', async () => {
    const ptr = await run(
      {
        'poll_codes/ABCDE': { sessionId: 'tA_ABCDE', teacherUid: 'tA' },
        'poll_sessions/tA_ABCDE': live('tA', { active: false, questions: [] }),
        'poll_sessions/tB_ABCDE': live('tB', { active: false, questions: [] }),
        'poll_sessions/tC_ZZZZZ': live('tC', { code: 'ABCDE' }),
      },
      'tA_ABCDE'
    );
    expect(ptr).toBeUndefined();
  });

  it('decides from the stored session, not a stale event', async () => {
    const stub = makeStubFirestore({
      'poll_sessions/t1_ABCDE': live('t1', { active: false, questions: [] }),
    });
    await handlePollSessionWrite(
      stub.db as unknown as Db,
      't1_ABCDE',
      change(live('t1'))
    );
    expect(stub.store.get('poll_codes/ABCDE')).toBeUndefined();
  });

  it('keeps an inactive holder on a tie with an inactive rival', async () => {
    const ptr = await run(
      {
        'poll_codes/ABCDE': { sessionId: 'tB_ABCDE', teacherUid: 'tB' },
        'poll_sessions/tA_ABCDE': live('tA', { active: false }),
      },
      'tB_ABCDE',
      live('tB', { active: false })
    );
    expect(ptr).toMatchObject({ sessionId: 'tB_ABCDE' });
  });
});
