import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PollConfig } from '@/types';

const { mockSetDoc, mockDoc, mockGetDocs } = vi.hoisted(() => ({
  mockSetDoc: vi.fn(),
  mockDoc: vi.fn((..._args: unknown[]) => ({
    __path: _args.slice(1).join('/'),
  })),
  mockGetDocs: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: mockDoc,
  setDoc: mockSetDoc,
  collection: vi.fn((..._args: unknown[]) => ({
    __path: _args.slice(1).join('/'),
  })),
  getDocs: mockGetDocs,
  limit: vi.fn((n: number) => ({ __limit: n })),
  query: vi.fn((...args: unknown[]) => ({ __query: args })),
  where: vi.fn((field: string, _op: string, value: unknown) => ({
    __where: [field, value],
  })),
}));

const mockGeneratePollCode = vi.fn(() => 'AAAAA');
vi.mock('@/utils/pollCode', async () => {
  const actual =
    await vi.importActual<typeof import('@/utils/pollCode')>(
      '@/utils/pollCode'
    );
  return { ...actual, generatePollCode: () => mockGeneratePollCode() };
});

import {
  makePollSessionId,
  aggregateVotes,
  toSessionQuestions,
  ensurePollJoinCode,
  lookupPollSessionByCode,
  startPollSession,
  stopPollSession,
  setSessionQuestionIndex,
} from './pollSession';

beforeEach(() => {
  vi.clearAllMocks();
  mockSetDoc.mockResolvedValue(undefined);
  mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
  mockGeneratePollCode.mockReturnValue('AAAAA');
});

describe('makePollSessionId', () => {
  it('joins teacher uid and poll session id with an underscore', () => {
    expect(makePollSessionId('teacher-1', 'K3F9Q')).toBe('teacher-1_K3F9Q');
  });
});

describe('aggregateVotes', () => {
  it('counts only the requested question’s votes', () => {
    const votes = [
      { id: '0_a', questionIndex: 0, optionIndex: 0 },
      { id: '0_b', questionIndex: 0, optionIndex: 2 },
      { id: '0_c', questionIndex: 0, optionIndex: 0 },
      { id: '1_a', questionIndex: 1, optionIndex: 1 },
    ];
    expect(aggregateVotes(votes, 0, 3)).toEqual([2, 0, 1]);
    expect(aggregateVotes(votes, 1, 3)).toEqual([0, 1, 0]);
  });

  it('ignores out-of-range / non-integer option indices', () => {
    const votes = [
      { id: '0_a', questionIndex: 0, optionIndex: 0 },
      { id: '0_b', questionIndex: 0, optionIndex: 5 },
      { id: '0_c', questionIndex: 0, optionIndex: -1 },
      { id: '0_d', questionIndex: 0, optionIndex: 1.5 },
    ];
    expect(aggregateVotes(votes, 0, 2)).toEqual([1, 0]);
  });

  it('counts a pre-multi-question vote doc against question 0', () => {
    const votes = [{ id: 'voter-1', optionIndex: 1 }];
    expect(aggregateVotes(votes, 0, 2)).toEqual([0, 1]);
    expect(aggregateVotes(votes, 1, 2)).toEqual([0, 0]);
  });

  it('counts a voter once when they hold both a legacy and a keyed doc', () => {
    const votes = [
      { id: 'voter-1', optionIndex: 0 },
      { id: '0_voter-1', questionIndex: 0, optionIndex: 1 },
    ];
    expect(aggregateVotes(votes, 0, 2)).toEqual([0, 1]);
  });
});

describe('toSessionQuestions', () => {
  it('strips vote counts from the participant-facing payload', () => {
    expect(
      toSessionQuestions([
        {
          id: 'q1',
          question: 'A?',
          options: [{ id: 'o1', label: 'Yes', votes: 7 }],
        },
      ])
    ).toEqual([
      { id: 'q1', question: 'A?', options: [{ id: 'o1', label: 'Yes' }] },
    ]);
  });
});

const baseConfig: PollConfig = {
  question: 'Q?',
  options: [
    { id: 'o1', label: 'A', votes: 0 },
    { id: 'o2', label: 'B', votes: 0 },
  ],
};

describe('ensurePollJoinCode', () => {
  it('mints a code and writes an inert session doc', async () => {
    const next = await ensurePollJoinCode(baseConfig, 'teacher-1');
    expect(next.joinCode).toBe('AAAAA');
    expect(mockDoc).toHaveBeenCalledWith(
      {},
      'poll_sessions',
      'teacher-1_AAAAA'
    );
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        code: 'AAAAA',
        active: false,
        startedAt: null,
        optionCounts: [2],
        currentQuestionIndex: 0,
      }),
      { merge: true }
    );
  });

  it('is a no-op once a code exists', async () => {
    const config = { ...baseConfig, joinCode: 'K3F9Q' };
    expect(await ensurePollJoinCode(config, 'teacher-1')).toBe(config);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('regenerates when the first candidate code is taken', async () => {
    mockGeneratePollCode
      .mockReturnValueOnce('TAKEN')
      .mockReturnValueOnce('FREE1');
    mockGetDocs
      .mockResolvedValueOnce({ empty: false, docs: [] })
      .mockResolvedValueOnce({ empty: true, docs: [] });
    const next = await ensurePollJoinCode(baseConfig, 'teacher-1');
    expect(next.joinCode).toBe('FREE1');
  });
});

describe('startPollSession', () => {
  it('keeps the reserved code on a first start so pre-shared links survive', async () => {
    const next = await startPollSession(
      { ...baseConfig, joinCode: 'K3F9Q' },
      'teacher-1',
      'fresh'
    );
    expect(next.joinCode).toBe('K3F9Q');
    expect(next.activePollSessionId).toBe('K3F9Q');
    expect(next.lastPollSessionId).toBeNull();
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        code: 'K3F9Q',
        active: true,
        startedAt: expect.any(Number) as unknown,
        optionCounts: [2],
      }),
      { merge: true }
    );
  });

  it('rotates the code when starting fresh after a previous session', async () => {
    mockGeneratePollCode.mockReturnValue('NEWCD');
    const next = await startPollSession(
      { ...baseConfig, joinCode: 'K3F9Q', lastPollSessionId: 'K3F9Q' },
      'teacher-1',
      'fresh'
    );
    expect(next.joinCode).toBe('NEWCD');
    expect(next.activePollSessionId).toBe('NEWCD');
    expect(next.lastPollSessionId).toBeNull();
  });

  it('reuses the sticky code (and its votes) on resume', async () => {
    const next = await startPollSession(
      { ...baseConfig, joinCode: 'K3F9Q', lastPollSessionId: 'K3F9Q' },
      'teacher-1',
      'resume'
    );
    expect(next.joinCode).toBe('K3F9Q');
    expect(next.activePollSessionId).toBe('K3F9Q');
    expect(next.lastPollSessionId).toBe('K3F9Q');
  });

  it('writes one optionCount entry per question', async () => {
    await startPollSession(
      {
        joinCode: 'K3F9Q',
        currentQuestionIndex: 1,
        questions: [
          {
            id: 'q1',
            question: 'A?',
            options: [
              { id: 'o1', label: 'A', votes: 0 },
              { id: 'o2', label: 'B', votes: 0 },
            ],
          },
          {
            id: 'q2',
            question: 'B?',
            options: [{ id: 'o3', label: 'C', votes: 0 }],
          },
        ],
      },
      'teacher-1',
      'resume'
    );
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        optionCounts: [2, 1],
        currentQuestionIndex: 1,
      }),
      { merge: true }
    );
  });
});

describe('stopPollSession', () => {
  it('closes the session and parks the id for resume', async () => {
    const next = await stopPollSession(
      { ...baseConfig, joinCode: 'K3F9Q', activePollSessionId: 'K3F9Q' },
      'teacher-1'
    );
    expect(next.activePollSessionId).toBeNull();
    expect(next.lastPollSessionId).toBe('K3F9Q');
    expect(mockDoc).toHaveBeenCalledWith(
      {},
      'poll_sessions',
      'teacher-1_K3F9Q'
    );
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ active: false }),
      { merge: true }
    );
  });
});

describe('lookupPollSessionByCode', () => {
  const makeSnapDoc = (id: string, data: Record<string, unknown>) => ({
    id,
    data: () => data,
  });

  it('returns null for an empty or unmatched code', async () => {
    expect(await lookupPollSessionByCode('   ')).toBeNull();
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    expect(await lookupPollSessionByCode('K3F9Q')).toBeNull();
  });

  it('normalizes the code before querying', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [makeSnapDoc('teacher-1_K3F9Q', { code: 'K3F9Q', active: true })],
    });
    const found = await lookupPollSessionByCode(' k3f-9q ');
    expect(found?.sessionId).toBe('teacher-1_K3F9Q');
  });

  it('prefers the active session when a code resolves to more than one doc', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        makeSnapDoc('teacher-1_K3F9Q', {
          code: 'K3F9Q',
          active: false,
          updatedAt: 9000,
        }),
        makeSnapDoc('teacher-2_K3F9Q', {
          code: 'K3F9Q',
          active: true,
          updatedAt: 1000,
        }),
      ],
    });
    const found = await lookupPollSessionByCode('K3F9Q');
    expect(found?.sessionId).toBe('teacher-2_K3F9Q');
  });
});

describe('setSessionQuestionIndex', () => {
  it('pushes the cursor onto the session doc', async () => {
    await setSessionQuestionIndex('teacher-1', 'K3F9Q', 2);
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ currentQuestionIndex: 2 }),
      { merge: true }
    );
  });
});
