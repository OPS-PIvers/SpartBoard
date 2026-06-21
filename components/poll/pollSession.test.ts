import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PollConfig } from '@/types';

const { mockSetDoc, mockDoc } = vi.hoisted(() => ({
  mockSetDoc: vi.fn(),
  mockDoc: vi.fn((..._args: unknown[]) => ({
    __path: _args.slice(1).join('/'),
  })),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: mockDoc,
  setDoc: mockSetDoc,
}));

import {
  makePollSessionId,
  aggregateVotes,
  startPollSession,
  stopPollSession,
} from './pollSession';

beforeEach(() => {
  vi.clearAllMocks();
  mockSetDoc.mockResolvedValue(undefined);
});

describe('makePollSessionId', () => {
  it('joins teacher uid and poll session id with an underscore', () => {
    expect(makePollSessionId('teacher-1', 'sess-9')).toBe('teacher-1_sess-9');
  });
});

describe('aggregateVotes', () => {
  it('counts votes per option index', () => {
    const votes = [{ optionIndex: 0 }, { optionIndex: 2 }, { optionIndex: 0 }];
    expect(aggregateVotes(votes, 3)).toEqual([2, 0, 1]);
  });

  it('ignores out-of-range / non-integer indices', () => {
    const votes = [
      { optionIndex: 0 },
      { optionIndex: 5 },
      { optionIndex: -1 },
      { optionIndex: 1.5 },
    ];
    expect(aggregateVotes(votes, 2)).toEqual([1, 0]);
  });
});

const baseConfig: PollConfig = {
  question: 'Q?',
  options: [
    { id: 'o1', label: 'A', votes: 0 },
    { id: 'o2', label: 'B', votes: 0 },
  ],
};

describe('startPollSession', () => {
  it('fresh: mints an id, writes an active session doc, returns updated config', async () => {
    const next = await startPollSession(baseConfig, 'teacher-1', 'fresh');
    expect(typeof next.activePollSessionId).toBe('string');
    expect(next.activePollSessionId).toBeTruthy();
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [, payload]: [unknown, Record<string, unknown>] = mockSetDoc.mock
      .calls[0] as [unknown, Record<string, unknown>];
    expect(payload).toMatchObject({
      teacherUid: 'teacher-1',
      optionCount: 2,
      active: true,
    });
  });

  it('resume: reuses lastPollSessionId', async () => {
    const next = await startPollSession(
      { ...baseConfig, lastPollSessionId: 'prev-1' },
      'teacher-1',
      'resume'
    );
    expect(next.activePollSessionId).toBe('prev-1');
    expect(mockDoc).toHaveBeenCalledWith(
      {},
      'poll_sessions',
      'teacher-1_prev-1'
    );
  });

  it('fresh: clears lastPollSessionId so stale resume popover cannot appear', async () => {
    // Bug: before the fix, a fresh start left lastPollSessionId pointing at
    // the old session. The UI (Settings + RemotePollControl) gates the
    // "Resume?" popover on config.lastPollSessionId being non-null, so after
    // stopping the just-started session the popover would offer to resume the
    // *abandoned* previous session rather than the newly-minted one.
    const configWithStaleResume: typeof baseConfig & {
      lastPollSessionId: string;
    } = {
      ...baseConfig,
      lastPollSessionId: 'old-session-id',
    };
    const next = await startPollSession(
      configWithStaleResume,
      'teacher-1',
      'fresh'
    );
    expect(next.lastPollSessionId).toBeNull();
    // And the new active id is a freshly-minted UUID (not the old one).
    expect(next.activePollSessionId).not.toBe('old-session-id');
    expect(typeof next.activePollSessionId).toBe('string');
    expect(next.activePollSessionId).toBeTruthy();
  });

  it('resume: preserves lastPollSessionId when it matches the resumed id', async () => {
    const next = await startPollSession(
      { ...baseConfig, lastPollSessionId: 'prev-2' },
      'teacher-1',
      'resume'
    );
    // On resume, lastPollSessionId was already the active id — it should be
    // left intact (the fix must not wipe it on resume mode).
    expect(next.lastPollSessionId).toBe('prev-2');
    expect(next.activePollSessionId).toBe('prev-2');
  });
});

describe('stopPollSession', () => {
  it('marks the session inactive and moves the id to lastPollSessionId', async () => {
    const next = await stopPollSession(
      { ...baseConfig, activePollSessionId: 'sess-7' },
      'teacher-1'
    );
    expect(next.activePollSessionId).toBeNull();
    expect(next.lastPollSessionId).toBe('sess-7');
    expect(mockDoc).toHaveBeenCalledWith(
      {},
      'poll_sessions',
      'teacher-1_sess-7'
    );
    const [, payload]: [unknown, Record<string, unknown>] = mockSetDoc.mock
      .calls[0] as [unknown, Record<string, unknown>];
    expect(payload).toMatchObject({ active: false });
  });
});
