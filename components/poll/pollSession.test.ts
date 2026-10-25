import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PollConfig } from '@/types';

const { mockSetDoc, mockDoc, mockGetDoc, mockDeleteDoc } = vi.hoisted(() => ({
  mockSetDoc: vi.fn(),
  mockDoc: vi.fn((..._args: unknown[]) => ({
    __path: _args.slice(1).join('/'),
  })),
  mockGetDoc: vi.fn(),
  mockDeleteDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: mockDoc,
  setDoc: mockSetDoc,
  getDoc: mockGetDoc,
  deleteDoc: mockDeleteDoc,
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
  toSessionResultsState,
  stopPollSession,
  setSessionQuestionIndex,
  withStoppedSessionEnded,
} from './pollSession';

beforeEach(() => {
  vi.clearAllMocks();
  mockSetDoc.mockResolvedValue(undefined);
  mockGetDoc.mockResolvedValue({ exists: () => false });
  mockDeleteDoc.mockResolvedValue(undefined);
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
    const code = await ensurePollJoinCode(baseConfig, 'teacher-1');
    expect(code).toBe('AAAAA');
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
    expect(await ensurePollJoinCode(config, 'teacher-1')).toBeNull();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('returns only the code, never a config the caller could stale-write', async () => {
    // Regression: returning `{ ...config, joinCode }` let a mint that resolved
    // after a concurrent edit revert that edit.
    const code = await ensurePollJoinCode(baseConfig, 'teacher-1');
    expect(typeof code).toBe('string');
  });

  it('regenerates when the first candidate code is taken', async () => {
    mockGeneratePollCode
      .mockReturnValueOnce('TAKEN')
      .mockReturnValueOnce('FREE1');
    mockGetDoc
      .mockResolvedValueOnce({ exists: () => true })
      .mockResolvedValueOnce({ exists: () => false });
    expect(await ensurePollJoinCode(baseConfig, 'teacher-1')).toBe('FREE1');
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
  it('remembers who ran a shared board session after it stops', async () => {
    const next = await stopPollSession(
      {
        ...baseConfig,
        joinCode: 'K3F9Q',
        activePollSessionId: 'K3F9Q',
        activePollSessionOwnerUid: 'colleague',
      },
      'colleague'
    );
    expect(next.activePollSessionOwnerUid).toBeNull();
    expect(next.lastPollSessionOwnerUid).toBe('colleague');
  });

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
  it('returns null for an empty or unmatched code', async () => {
    expect(await lookupPollSessionByCode('   ')).toBeNull();
    expect(await lookupPollSessionByCode('K3F9Q')).toBeNull();
  });

  it('resolves the normalized code through its pointer to one session doc', async () => {
    mockGetDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ sessionId: 'teacher-1_K3F9Q' }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        id: 'teacher-1_K3F9Q',
        data: () => ({ code: 'K3F9Q', active: true }),
      });
    const found = await lookupPollSessionByCode(' k3f-9q ');
    expect(mockDoc).toHaveBeenCalledWith({}, 'poll_codes', 'K3F9Q');
    expect(found?.sessionId).toBe('teacher-1_K3F9Q');
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

describe('toSessionResultsState', () => {
  const config: PollConfig = {
    questions: [
      { id: 'q1', question: 'A?', options: [] },
      { id: 'q2', question: 'B?', options: [] },
    ],
    hideResults: true,
    revealedQuestionIds: ['q2', 'gone'],
    lockedQuestionIds: ['q1'],
  };

  it('maps question ids to the indexes the rules check', () => {
    expect(toSessionResultsState(config)).toEqual({
      hideResults: true,
      revealedQuestions: [1],
      lockedQuestions: [0],
      shownAnswers: [],
    });
  });

  it('defaults to visible and unlocked', () => {
    expect(toSessionResultsState({ questions: config.questions })).toEqual({
      hideResults: false,
      revealedQuestions: [],
      lockedQuestions: [],
      shownAnswers: [],
    });
  });
});

describe('startPollSession results state', () => {
  const hidden: PollConfig = {
    ...baseConfig,
    joinCode: 'K3F9Q',
    lastPollSessionId: 'K3F9Q',
    hideResults: true,
    revealedQuestionIds: ['q-1'],
    lockedQuestionIds: ['q-1'],
  };
  const written = () =>
    mockSetDoc.mock.calls
      .map((call) => call[1] as Record<string, unknown>)
      .reverse()
      .find((data) => 'revealedQuestions' in data);

  it('resume keeps reveals and locks for a poll-pro teacher', async () => {
    const next = await startPollSession(
      hidden,
      'teacher-1',
      'resume',
      false,
      true
    );
    expect(next.lockedQuestionIds).toEqual(hidden.lockedQuestionIds);
    expect(written()).toMatchObject({
      hideResults: true,
      revealedQuestions: [0],
      lockedQuestions: [0],
    });
  });

  it('fresh clears reveals and locks', async () => {
    const next = await startPollSession(
      hidden,
      'teacher-1',
      'fresh',
      false,
      true
    );
    expect(next.revealedQuestionIds).toEqual([]);
    expect(next.lockedQuestionIds).toEqual([]);
    expect(written()).toMatchObject({
      revealedQuestions: [],
      lockedQuestions: [],
    });
  });

  it('a teacher without poll-pro always opens a visible, unlocked session', async () => {
    await startPollSession(hidden, 'teacher-1', 'resume');
    expect(written()).toMatchObject({
      hideResults: false,
      revealedQuestions: [],
      lockedQuestions: [],
    });
  });
});

describe('toSessionResultsState shown answers', () => {
  const config: PollConfig = {
    questions: [
      {
        id: 'q1',
        question: 'A?',
        options: [
          { id: 'a', label: 'A', votes: 0 },
          { id: 'b', label: 'B', votes: 0, correct: true },
        ],
      },
      {
        id: 'q2',
        question: 'B?',
        options: [{ id: 'c', label: 'C', votes: 0, correct: true }],
      },
    ],
  };

  it('writes no answers until a question is shown', () => {
    expect(toSessionResultsState(config).shownAnswers).toEqual([]);
  });

  it('writes only shown questions as question:option id keys', () => {
    expect(
      toSessionResultsState({ ...config, answerShownQuestionIds: ['q1'] })
        .shownAnswers
    ).toEqual(['q1:b']);
  });

  it('never writes answers without the flag', () => {
    expect(
      toSessionResultsState(
        { ...config, answerShownQuestionIds: ['q1'] },
        false
      ).shownAnswers
    ).toEqual([]);
  });

  it('keeps correct flags out of the session questions', () => {
    expect(
      JSON.stringify(toSessionQuestions(config.questions ?? []))
    ).not.toContain('correct');
  });

  it('keeps a rating scale and its end labels on the session question', () => {
    const [q] = toSessionQuestions([
      {
        id: 'q-scale',
        question: 'How sure?',
        kind: 'scale',
        scaleLow: 'Not sure',
        options: [{ id: 'a', label: '1', votes: 2 }],
      },
    ]);
    expect(q).toEqual({
      id: 'q-scale',
      question: 'How sure?',
      kind: 'scale',
      scaleLow: 'Not sure',
      scaleHigh: '',
      options: [{ id: 'a', label: '1' }],
    });
  });

  it('sends a rating scale as plain options without the flag', () => {
    const [q] = toSessionQuestions(
      [
        {
          id: 'q-scale',
          question: 'How sure?',
          kind: 'scale',
          options: [{ id: 'a', label: '1', votes: 0 }],
        },
      ],
      false
    );
    expect(q.kind).toBeUndefined();
  });
});

describe('word cloud and open response sessions', () => {
  it('lists text questions for the rules only with the flag', async () => {
    const config: PollConfig = {
      joinCode: 'K3F9Q',
      questions: [
        {
          id: 'q1',
          question: 'Pick',
          options: [{ id: 'a', label: 'A', votes: 0 }],
        },
        { id: 'q2', question: 'One word?', kind: 'words', options: [] },
        { id: 'q3', question: 'Why?', kind: 'text', options: [] },
      ],
    };
    await startPollSession(config, 'teacher-1', 'resume', false, true);
    expect(mockSetDoc).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        optionCounts: [1, 0, 0],
        textQuestions: [1, 2],
      }),
      { merge: true }
    );
    await startPollSession(config, 'teacher-1', 'resume', false, false);
    expect(mockSetDoc).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ textQuestions: [] }),
      { merge: true }
    );
  });

  it('leaves typed answers out of option tallies', () => {
    expect(
      aggregateVotes(
        [
          { id: '0_a', questionIndex: 0, text: 'hello' },
          { id: '0_b', questionIndex: 0, optionIndex: 1 },
        ],
        0,
        2
      )
    ).toEqual([0, 1]);
  });
});

describe('withStoppedSessionEnded', () => {
  it('drops a stopped session and its code so Start mints a new one', () => {
    expect(
      withStoppedSessionEnded({
        ...baseConfig,
        joinCode: 'K3F9Q',
        lastPollSessionId: 'K3F9Q',
        lastPollSessionOwnerUid: 'teacher-1',
      })
    ).toMatchObject({
      joinCode: null,
      lastPollSessionId: null,
      lastPollSessionOwnerUid: null,
    });
  });

  it('leaves a live session alone', () => {
    const live = {
      ...baseConfig,
      joinCode: 'K3F9Q',
      activePollSessionId: 'K3F9Q',
      lastPollSessionId: 'K3F9Q',
    };
    expect(withStoppedSessionEnded(live)).toBe(live);
  });
});
