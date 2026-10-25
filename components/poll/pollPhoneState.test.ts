import { describe, expect, it } from 'vitest';
import type { PollSessionDoc } from '@/types';
import {
  derivePollPhoneView,
  initialPollPhoneState,
  pollPhoneReducer,
  type PollPhoneEvent,
  type PollPhoneState,
  type PollVoteStatus,
} from './pollPhoneState';
import type { PollVoteEntry } from './pollSession';

const makeSession = (
  overrides: Partial<PollSessionDoc> = {}
): PollSessionDoc => ({
  id: 'K3F9Q',
  teacherUid: 'teacher-1',
  code: 'K3F9Q',
  questions: [
    {
      id: 'q1',
      question: 'Favorite fruit?',
      options: [
        { id: 'o1', label: 'Apple' },
        { id: 'o2', label: 'Banana' },
      ],
    },
    {
      id: 'q2',
      question: 'Best season?',
      options: [
        { id: 'o3', label: 'Summer' },
        { id: 'o4', label: 'Winter' },
      ],
    },
  ],
  optionCounts: [2, 2],
  currentQuestionIndex: 0,
  active: true,
  startedAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

const ready = (
  vote: PollVoteStatus = 'idle',
  session: PollSessionDoc = makeSession(),
  votes: PollVoteEntry[] = []
): PollPhoneState => ({
  phase: 'ready',
  sessionId: 'teacher-1_K3F9Q',
  session,
  votes,
  vote,
});

const allEvents: PollPhoneEvent[] = [
  { type: 'lookupSucceeded', sessionId: 'x', session: makeSession() },
  { type: 'lookupFailed' },
  { type: 'sessionSnapshot', session: makeSession() },
  { type: 'votesSnapshot', votes: [] },
  { type: 'voteStarted' },
  { type: 'voteSaved' },
  { type: 'voteRejected' },
  { type: 'voteFailed' },
];

const run = (state: PollPhoneState, ...events: PollPhoneEvent[]) =>
  events.reduce(pollPhoneReducer, state);

describe('pollPhoneReducer: allowed transitions', () => {
  it('loading -> ready on a found session', () => {
    const session = makeSession();
    expect(
      run(initialPollPhoneState, {
        type: 'lookupSucceeded',
        sessionId: 's1',
        session,
      })
    ).toEqual({
      phase: 'ready',
      sessionId: 's1',
      session,
      votes: [],
      vote: 'idle',
    });
  });

  it('loading -> unavailable when the lookup fails', () => {
    expect(run(initialPollPhoneState, { type: 'lookupFailed' })).toEqual({
      phase: 'unavailable',
    });
  });

  it('ready takes every session and votes snapshot', () => {
    const session = makeSession({ currentQuestionIndex: 1 });
    const votes = [{ id: '1_a', questionIndex: 1, optionIndex: 0 }];
    const next = run(
      ready(),
      { type: 'sessionSnapshot', session },
      { type: 'votesSnapshot', votes }
    );
    expect(next).toEqual(ready('idle', session, votes));
  });

  it('idle -> submitting -> idle on a saved vote', () => {
    const submitting = run(ready(), { type: 'voteStarted' });
    expect(submitting).toEqual(ready('submitting'));
    expect(run(submitting, { type: 'voteSaved' })).toEqual(ready('idle'));
  });

  it('submitting -> idle on a non-rules error, so options stay tappable', () => {
    expect(run(ready('submitting'), { type: 'voteFailed' })).toEqual(
      ready('idle')
    );
  });

  it('submitting -> rejected on a rules rejection', () => {
    expect(run(ready('submitting'), { type: 'voteRejected' })).toEqual(
      ready('rejected')
    );
  });

  it('rejected -> idle on the next live session snapshot', () => {
    const session = makeSession({ updatedAt: 2000 });
    expect(
      run(ready('rejected'), { type: 'sessionSnapshot', session })
    ).toEqual(ready('idle', session));
  });

  it('rejected stays rejected on a closed session snapshot', () => {
    const session = makeSession({ active: false });
    expect(
      run(ready('rejected'), { type: 'sessionSnapshot', session })
    ).toEqual(ready('rejected', session));
  });

  it('submitting survives a session snapshot', () => {
    const session = makeSession({ active: false });
    expect(
      run(ready('submitting'), { type: 'sessionSnapshot', session })
    ).toEqual(ready('submitting', session));
  });
});

describe('pollPhoneReducer: disallowed events leave state unchanged', () => {
  const loadingAllowed = new Set(['lookupSucceeded', 'lookupFailed']);
  it.each(allEvents.filter((e) => !loadingAllowed.has(e.type)))(
    'loading ignores $type',
    (event) => {
      expect(pollPhoneReducer(initialPollPhoneState, event)).toBe(
        initialPollPhoneState
      );
    }
  );

  it.each(allEvents)('unavailable ignores $type', (event) => {
    const state: PollPhoneState = { phase: 'unavailable' };
    expect(pollPhoneReducer(state, event)).toBe(state);
  });

  it.each([
    { type: 'lookupSucceeded', sessionId: 'x', session: makeSession() },
    { type: 'lookupFailed' },
  ] as PollPhoneEvent[])('ready ignores $type', (event) => {
    const state = ready();
    expect(pollPhoneReducer(state, event)).toBe(state);
  });

  it.each(['voteSaved', 'voteRejected', 'voteFailed'] as const)(
    'idle ignores %s with no vote in flight',
    (type) => {
      const state = ready('idle');
      expect(pollPhoneReducer(state, { type })).toBe(state);
    }
  );

  it.each(['voteSaved', 'voteRejected', 'voteFailed'] as const)(
    'rejected ignores %s',
    (type) => {
      const state = ready('rejected');
      expect(pollPhoneReducer(state, { type })).toBe(state);
    }
  );

  it.each([
    ['a second tap while submitting', ready('submitting')],
    ['a tap after a rejection', ready('rejected')],
    [
      'a tap after the teacher closed',
      ready('idle', makeSession({ active: false })),
    ],
    [
      'a tap before voting opens',
      ready('idle', makeSession({ startedAt: null, active: false })),
    ],
  ])('voteStarted is ignored on %s', (_label, state) => {
    expect(pollPhoneReducer(state, { type: 'voteStarted' })).toBe(state);
  });
});

describe('derivePollPhoneView', () => {
  it('maps loading and unavailable through', () => {
    expect(derivePollPhoneView(initialPollPhoneState, 'u')).toEqual({
      k: 'loading',
    });
    expect(derivePollPhoneView({ phase: 'unavailable' }, 'u')).toEqual({
      k: 'unavailable',
    });
  });

  it('is unavailable when the session has no questions', () => {
    expect(
      derivePollPhoneView(ready('idle', makeSession({ questions: [] })), 'u').k
    ).toBe('unavailable');
  });

  it('is waiting before the teacher first opens voting', () => {
    expect(
      derivePollPhoneView(
        ready('idle', makeSession({ startedAt: null, active: false })),
        'u'
      )
    ).toEqual({ k: 'waiting' });
  });

  it('is open with the tally and my vote on the current question', () => {
    const votes = [
      { id: '0_u', questionIndex: 0, optionIndex: 1 },
      { id: '0_v', questionIndex: 0, optionIndex: 1 },
      { id: '1_u', questionIndex: 1, optionIndex: 0 },
    ];
    const view = derivePollPhoneView(ready('idle', makeSession(), votes), 'u');
    expect(view.k).toBe('open');
    if (view.k !== 'open') return;
    expect(view.ballot.questionIndex).toBe(0);
    expect(view.ballot.tally).toEqual([0, 2]);
    expect(view.ballot.total).toBe(2);
    expect(view.ballot.votedIndex).toBe(1);
    expect(view.ballot.submitting).toBe(false);
  });

  it('clamps an out-of-range cursor', () => {
    const view = derivePollPhoneView(
      ready('idle', makeSession({ currentQuestionIndex: 9 })),
      'u'
    );
    expect(view.k === 'open' && view.ballot.questionIndex).toBe(1);
  });

  it('shows submitting on the open ballot', () => {
    const view = derivePollPhoneView(ready('submitting'), 'u');
    expect(view.k === 'open' && view.ballot.submitting).toBe(true);
  });

  it('is closed by the teacher once a started session goes inactive', () => {
    const view = derivePollPhoneView(
      ready('idle', makeSession({ active: false })),
      'u'
    );
    expect(view.k === 'closed' && view.reason).toBe('teacher');
  });

  it('is closed as rejected while the session still reads live', () => {
    const view = derivePollPhoneView(ready('rejected'), 'u');
    expect(view.k === 'closed' && view.reason).toBe('rejected');
  });
});

describe('teacher and phone disagreement', () => {
  it('teacher closes while a vote is in flight: phone shows closed and keeps the spinner until the write returns', () => {
    const closedSession = makeSession({ active: false });
    const mid = run(
      ready(),
      { type: 'voteStarted' },
      {
        type: 'sessionSnapshot',
        session: closedSession,
      }
    );
    const view = derivePollPhoneView(mid, 'u');
    expect(view.k === 'closed' && view.ballot.submitting).toBe(true);
    const after = run(mid, { type: 'voteRejected' });
    expect(derivePollPhoneView(after, 'u')).toMatchObject({
      k: 'closed',
      reason: 'teacher',
      ballot: { submitting: false },
    });
  });

  it('vote rejected before the closed snapshot arrives, then the teacher resumes: phone reopens', () => {
    const rejected = run(
      ready(),
      { type: 'voteStarted' },
      {
        type: 'voteRejected',
      }
    );
    expect(derivePollPhoneView(rejected, 'u')).toMatchObject({
      k: 'closed',
      reason: 'rejected',
    });
    const closed = run(rejected, {
      type: 'sessionSnapshot',
      session: makeSession({ active: false }),
    });
    expect(derivePollPhoneView(closed, 'u')).toMatchObject({
      k: 'closed',
      reason: 'teacher',
    });
    const resumed = run(closed, {
      type: 'sessionSnapshot',
      session: makeSession({ active: true, updatedAt: 3000 }),
    });
    expect(derivePollPhoneView(resumed, 'u').k).toBe('open');
  });

  it('network blip on a vote: phone stays open', () => {
    const next = run(ready(), { type: 'voteStarted' }, { type: 'voteFailed' });
    expect(derivePollPhoneView(next, 'u').k).toBe('open');
  });

  it('teacher moves to the next question while a vote is in flight: the ballot follows the cursor', () => {
    const next = run(
      ready(),
      { type: 'voteStarted' },
      {
        type: 'sessionSnapshot',
        session: makeSession({ currentQuestionIndex: 1 }),
      },
      { type: 'voteSaved' }
    );
    const view = derivePollPhoneView(next, 'u');
    expect(view.k === 'open' && view.ballot.questionIndex).toBe(1);
  });

  it('phone opens after the teacher stopped: lookup lands on a closed ballot', () => {
    const next = run(initialPollPhoneState, {
      type: 'lookupSucceeded',
      sessionId: 's1',
      session: makeSession({ active: false }),
    });
    expect(derivePollPhoneView(next, 'u')).toMatchObject({
      k: 'closed',
      reason: 'teacher',
    });
  });

  it('teacher opens voting on a waiting phone', () => {
    const waiting = ready(
      'idle',
      makeSession({ startedAt: null, active: false })
    );
    const next = run(waiting, {
      type: 'sessionSnapshot',
      session: makeSession(),
    });
    expect(derivePollPhoneView(next, 'u').k).toBe('open');
  });
});

describe('hidden results and locked questions', () => {
  it('holds tallies back until the teacher reveals the question', () => {
    const view = derivePollPhoneView(
      ready('idle', makeSession({ hideResults: true, revealedQuestions: [] })),
      'me'
    );
    expect(view.k === 'open' && view.ballot.resultsHidden).toBe(true);
  });

  it('shows revealed results to everyone', () => {
    const view = derivePollPhoneView(
      ready('idle', makeSession({ hideResults: true, revealedQuestions: [0] })),
      'me'
    );
    expect(view.k === 'open' && view.ballot).toMatchObject({
      resultsHidden: false,
      resultsRevealed: true,
    });
  });

  it('closes a locked question without closing the session', () => {
    const session = makeSession({ lockedQuestions: [0] });
    expect(derivePollPhoneView(ready('idle', session), 'me')).toMatchObject({
      k: 'closed',
      reason: 'locked',
    });
    expect(
      derivePollPhoneView(
        ready('idle', { ...session, currentQuestionIndex: 1 }),
        'me'
      ).k
    ).toBe('open');
  });

  it('refuses to start a vote on a locked question', () => {
    const state = ready('idle', makeSession({ lockedQuestions: [0] }));
    expect(pollPhoneReducer(state, { type: 'voteStarted' })).toBe(state);
  });
});

describe('shown answers', () => {
  it('keeps correct answers off the ballot until the teacher shows them', () => {
    const view = derivePollPhoneView(ready('idle', makeSession()), 'me');
    expect(view.k === 'open' && view.ballot.correctIndexes).toBeNull();
  });

  it('marks the current question’s correct options once shown', () => {
    const view = derivePollPhoneView(
      ready('idle', makeSession({ shownAnswers: ['q1:o2', 'q2:o3'] })),
      'me'
    );
    expect(view.k === 'open' && view.ballot.correctIndexes).toEqual([1]);
  });

  it('ignores answer keys for options the session snapshot does not have', () => {
    const view = derivePollPhoneView(
      ready('idle', makeSession({ shownAnswers: ['q1:gone'] })),
      'me'
    );
    expect(view.k === 'open' && view.ballot.correctIndexes).toBeNull();
  });
});
