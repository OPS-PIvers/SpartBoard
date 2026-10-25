import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
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
  const stub = makeStubFirestore(seed);
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
        'poll_codes/ABCDE': { sessionId: 'tA_ABCDE', teacherUid: 'tA' },
        'poll_sessions/tA_ABCDE': live('tA', { active: false }),
      },
      'tB_ABCDE',
      live('tB')
    );
    expect(ptr).toMatchObject({ sessionId: 'tB_ABCDE' });
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
});
