import { describe, it, expect } from 'vitest';
import type {
  VideoActivityLiveState,
  VideoActivityPublicQuestion,
  VideoActivitySession,
} from '@/types';
import {
  completionPatch,
  deriveVaLiveState,
  deriveVaResponseState,
  deriveVaSessionState,
  initialSelfPacedPlayerState,
  isVaResponseCompleted,
  livePacingPatch,
  liveTransition,
  openLiveQuestionId,
  rejoinOutcome,
  responseTransition,
  selfPacedPlayerReducer,
  selfPacedVideoEnded,
  unlockPatch,
  type SelfPacedPlayerEvent,
  type SelfPacedPlayerState,
  type VaLiveEvent,
  type VaLiveState,
  type VaResponseEvent,
  type VaResponseState,
} from '@/utils/videoActivityState';
import { liveStudentScreen } from '@/utils/videoActivityLiveStudent';

const live = (
  over: Partial<VideoActivityLiveState> = {}
): VideoActivityLiveState => ({
  currentQuestionId: null,
  questionPhase: 'closed',
  resultsShown: false,
  answerRevealed: false,
  askedQuestionIds: [],
  skippedQuestionIds: [],
  playheadSeconds: 0,
  updatedAt: 1,
  ...over,
});

type SessionFields = Pick<VideoActivitySession, 'status' | 'live'>;

const ops = {
  arrayUnion: (...v: string[]) => ({ union: v }),
  arrayRemove: (...v: string[]) => ({ remove: v }),
  increment: (n: number) => ({ increment: n }),
};

/** Applies a pacing patch the way Firestore would, so the stored result can be derived again. */
function applyPatch(
  session: SessionFields,
  patch: Record<string, unknown>
): SessionFields {
  const next: SessionFields = {
    status: session.status,
    live: { ...(session.live ?? live()) },
  };
  const l = next.live as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (!key.startsWith('live.')) {
      if (key === 'status') next.status = value as SessionFields['status'];
      continue;
    }
    const field = key.slice(5);
    const current = (l[field] as string[] | undefined) ?? [];
    if (value && typeof value === 'object' && 'union' in value) {
      l[field] = [
        ...current,
        ...(value as { union: string[] }).union.filter(
          (v) => !current.includes(v)
        ),
      ];
    } else if (value && typeof value === 'object' && 'remove' in value) {
      l[field] = current.filter(
        (v) => !(value as { remove: string[] }).remove.includes(v)
      );
    } else {
      l[field] = value;
    }
  }
  return next;
}

const LOBBY: VaLiveState = { phase: 'lobby' };
const WATCHING: VaLiveState = { phase: 'watching' };
const OPEN_Q1: VaLiveState = {
  phase: 'question',
  questionId: 'q1',
  open: true,
  resultsShown: false,
  answerRevealed: false,
  revealedAnswer: null,
};
const ENDED: VaLiveState = { phase: 'ended' };

const STORED: Record<string, SessionFields> = {
  lobby: { status: 'waiting', live: live() },
  watching: { status: 'active', live: live() },
  question: {
    status: 'active',
    live: live({
      currentQuestionId: 'q1',
      questionPhase: 'open',
      askedQuestionIds: ['q1'],
    }),
  },
  ended: { status: 'ended', live: live() },
};

const EVENTS: VaLiveEvent[] = [
  { type: 'start' },
  { type: 'open', questionId: 'q2', playheadSeconds: 12 },
  { type: 'resume', playheadSeconds: 15 },
  { type: 'showResults', shown: true },
  { type: 'reveal', revealed: true, correctAnswer: 'Paris' },
  { type: 'skip', questionIds: ['q3'], playheadSeconds: 20 },
  { type: 'end', playheadSeconds: 30 },
];

describe('deriveVaLiveState', () => {
  it('reads each stored pacing shape', () => {
    expect(deriveVaLiveState(STORED.lobby)).toEqual(LOBBY);
    expect(deriveVaLiveState(STORED.watching)).toEqual(WATCHING);
    expect(deriveVaLiveState(STORED.question)).toEqual(OPEN_Q1);
    expect(deriveVaLiveState(STORED.ended)).toEqual(ENDED);
  });

  it('treats an active session with no live block as watching', () => {
    expect(deriveVaLiveState({ status: 'active' })).toEqual(WATCHING);
  });

  it('drops reveal flags left over after resume', () => {
    expect(
      deriveVaLiveState({
        status: 'active',
        live: live({ answerRevealed: true, resultsShown: true }),
      })
    ).toEqual(WATCHING);
  });

  it('keeps a stored question id with a closed phase as a closed question', () => {
    const state = deriveVaLiveState({
      status: 'active',
      live: live({ currentQuestionId: 'q1', questionPhase: 'closed' }),
    });
    expect(state).toMatchObject({ phase: 'question', open: false });
    expect(openLiveQuestionId(state)).toBeNull();
  });

  it('ignores an open phase with no question id', () => {
    expect(
      deriveVaLiveState({
        status: 'active',
        live: live({ questionPhase: 'open' }),
      })
    ).toEqual(WATCHING);
  });
});

describe('liveTransition: allowed', () => {
  it('Start leaves the lobby', () => {
    expect(liveTransition(LOBBY, { type: 'start' })).toEqual(WATCHING);
  });

  it('opening a question from watching or another question resets its flags', () => {
    const open = {
      type: 'open',
      questionId: 'q2',
      playheadSeconds: 5,
    } as const;
    const expected = { ...OPEN_Q1, questionId: 'q2' };
    expect(liveTransition(WATCHING, open)).toEqual(expected);
    expect(
      liveTransition(
        { ...OPEN_Q1, answerRevealed: true, resultsShown: true },
        open
      )
    ).toEqual(expected);
  });

  it('Resume returns to watching', () => {
    expect(
      liveTransition(OPEN_Q1, { type: 'resume', playheadSeconds: 9 })
    ).toEqual(WATCHING);
  });

  it('results and reveal toggle on the open question', () => {
    const shown = liveTransition(OPEN_Q1, { type: 'showResults', shown: true });
    expect(shown).toEqual({ ...OPEN_Q1, resultsShown: true });
    const revealed = liveTransition(shown, {
      type: 'reveal',
      revealed: true,
      correctAnswer: 'B|C',
    });
    expect(revealed).toEqual({
      ...OPEN_Q1,
      resultsShown: true,
      answerRevealed: true,
      revealedAnswer: 'B|C',
    });
    expect(
      liveTransition(revealed, {
        type: 'reveal',
        revealed: false,
        correctAnswer: 'B|C',
      })
    ).toEqual({ ...OPEN_Q1, resultsShown: true });
  });

  it('End ends from the lobby, watching or a question', () => {
    for (const from of [LOBBY, WATCHING, OPEN_Q1]) {
      expect(liveTransition(from, { type: 'end', playheadSeconds: 1 })).toEqual(
        ENDED
      );
    }
  });

  it('a skip never changes the phase', () => {
    for (const from of [WATCHING, OPEN_Q1]) {
      expect(
        liveTransition(from, {
          type: 'skip',
          questionIds: ['q3'],
          playheadSeconds: 2,
        })
      ).toBe(from);
    }
  });
});

describe('liveTransition: disallowed events leave the state unchanged', () => {
  const allowed: Record<VaLiveState['phase'], VaLiveEvent['type'][]> = {
    lobby: ['start', 'end'],
    watching: ['open', 'end'],
    question: ['open', 'resume', 'showResults', 'reveal', 'end'],
    ended: [],
  };
  for (const from of [LOBBY, WATCHING, OPEN_Q1, ENDED]) {
    for (const event of EVENTS) {
      if (allowed[from.phase].includes(event.type)) continue;
      it(`${event.type} from ${from.phase}`, () => {
        expect(liveTransition(from, event)).toBe(from);
      });
    }
  }
});

describe('livePacingPatch', () => {
  it('writes what the transition table says, for every allowed event', () => {
    for (const [name, stored] of Object.entries(STORED)) {
      const from = deriveVaLiveState(stored);
      for (const event of EVENTS) {
        const to = liveTransition(from, event);
        if (to === from) continue;
        const patch = livePacingPatch(event, 1000, ops);
        expect(patch, `${event.type} from ${name}`).not.toBeNull();
        expect(
          deriveVaLiveState(applyPatch(stored, patch ?? {})),
          `${event.type} from ${name}`
        ).toEqual(to);
      }
    }
  });

  it('records asked and skipped questions on open and skip', () => {
    let stored = STORED.watching;
    stored = applyPatch(
      stored,
      livePacingPatch(
        { type: 'skip', questionIds: ['q1', 'q2'], playheadSeconds: 9 },
        1,
        ops
      ) ?? {}
    );
    stored = applyPatch(
      stored,
      livePacingPatch(
        { type: 'open', questionId: 'q2', playheadSeconds: 10 },
        2,
        ops
      ) ?? {}
    );
    expect(stored.live?.askedQuestionIds).toEqual(['q2']);
    expect(stored.live?.skippedQuestionIds).toEqual(['q1']);
    expect(stored.live?.playheadSeconds).toBe(10);
  });

  it('writes nothing for an empty skip and clamps a negative playhead', () => {
    expect(
      livePacingPatch(
        { type: 'skip', questionIds: [], playheadSeconds: 3 },
        1,
        ops
      )
    ).toBeNull();
    expect(
      livePacingPatch({ type: 'resume', playheadSeconds: -4 }, 1, ops)
    ).toMatchObject({ 'live.playheadSeconds': 0 });
  });

  it('End stamps endedAt and closes the question in one write', () => {
    expect(
      livePacingPatch({ type: 'end', playheadSeconds: 8 }, 77, ops)
    ).toEqual({
      status: 'ended',
      endedAt: 77,
      'live.currentQuestionId': null,
      'live.questionPhase': 'closed',
      'live.updatedAt': 77,
      'live.playheadSeconds': 8,
    });
  });
});

describe('deriveVaSessionState', () => {
  it('tells a paused self-paced run from an ended one by the assignment', () => {
    expect(
      deriveVaSessionState(
        { status: 'ended', sessionMode: 'student' },
        'paused'
      )
    ).toEqual({
      mode: 'self-paced',
      run: { phase: 'paused', resumeTo: 'active' },
    });
    expect(deriveVaSessionState({ status: 'ended' }, 'inactive')).toEqual({
      mode: 'self-paced',
      run: { phase: 'ended' },
    });
    expect(deriveVaSessionState({ status: 'active' })).toEqual({
      mode: 'self-paced',
      run: { phase: 'active' },
    });
  });

  it('a live run ends regardless of the assignment status', () => {
    expect(
      deriveVaSessionState(
        { status: 'ended', sessionMode: 'teacher', live: live() },
        'paused'
      )
    ).toEqual({ mode: 'live', pacing: ENDED });
  });

  it('returns null for a status VA never writes', () => {
    expect(
      deriveVaSessionState({
        status: 'paused' as VideoActivitySession['status'],
      })
    ).toBeNull();
  });
});

describe('response state', () => {
  type Fields = { completedAt: number | null; completedAttempts: number };
  const inProgress: Fields = { completedAt: null, completedAttempts: 0 };
  const completed: Fields = { completedAt: 50, completedAttempts: 1 };

  it('derives completed from completedAt and resumed from unlocked', () => {
    expect(deriveVaResponseState(inProgress)).toEqual({
      kind: 'in-progress',
      resumed: false,
    });
    expect(
      deriveVaResponseState({ completedAt: null, unlocked: true })
    ).toEqual({ kind: 'in-progress', resumed: true });
    expect(deriveVaResponseState(completed)).toEqual({
      kind: 'completed',
      completedAt: 50,
    });
    expect(isVaResponseCompleted(completed)).toBe(true);
    expect(isVaResponseCompleted(inProgress)).toBe(false);
  });

  describe('rejoinOutcome', () => {
    it('does nothing for an attempt still in progress', () => {
      expect(rejoinOutcome(inProgress, 5, 1)).toBe('none');
    });
    it('resumes an unlocked attempt whose completion is still visible', () => {
      expect(rejoinOutcome({ ...completed, unlocked: true }, 9, 1)).toBe(
        'resume-unlocked'
      );
    });
    it('starts a fresh attempt under the cap or without one', () => {
      expect(rejoinOutcome(completed, 0, 2)).toBe('reset');
      expect(
        rejoinOutcome({ ...completed, completedAttempts: 7 }, 0, null)
      ).toBe('reset');
    });
    it('refuses at the cap, counting the ledger and legacy completions', () => {
      expect(rejoinOutcome(completed, 0, 1)).toBe('at-cap');
      expect(
        rejoinOutcome({ completedAt: 5, completedAttempts: 0 }, 0, 1)
      ).toBe('at-cap');
      expect(rejoinOutcome(completed, 3, 3)).toBe('at-cap');
    });
  });

  describe('responseTransition', () => {
    const IN: VaResponseState = { kind: 'in-progress', resumed: false };
    const DONE: VaResponseState = { kind: 'completed', completedAt: 50 };

    it('allowed: complete, rejoin, unlock', () => {
      expect(
        responseTransition(IN, { type: 'complete', now: 60 }, inProgress)
      ).toEqual({ kind: 'completed', completedAt: 60 });
      expect(
        responseTransition(
          DONE,
          { type: 'rejoin', ledgerCompleted: 0, attemptLimit: 2 },
          completed
        )
      ).toEqual(IN);
      expect(
        responseTransition(
          DONE,
          { type: 'rejoin', ledgerCompleted: 0, attemptLimit: 1 },
          { ...completed, unlocked: true }
        )
      ).toEqual({ kind: 'in-progress', resumed: true });
      expect(responseTransition(DONE, { type: 'unlock' }, completed)).toEqual({
        kind: 'in-progress',
        resumed: true,
      });
    });

    it('disallowed: a second completion, a rejoin at the cap or mid-attempt, answers', () => {
      const cases: [VaResponseState, VaResponseEvent, Fields][] = [
        [DONE, { type: 'complete', now: 99 }, completed],
        [
          DONE,
          { type: 'rejoin', ledgerCompleted: 0, attemptLimit: 1 },
          completed,
        ],
        [
          IN,
          { type: 'rejoin', ledgerCompleted: 0, attemptLimit: 3 },
          inProgress,
        ],
        [IN, { type: 'answer' }, inProgress],
        [DONE, { type: 'answer' }, completed],
      ];
      for (const [from, event, existing] of cases) {
        expect(responseTransition(from, event, existing)).toBe(from);
      }
    });
  });

  it('completionPatch counts the attempt, clears an unlock, and no-ops when complete', () => {
    expect(completionPatch(inProgress, 70, ops)).toEqual({
      completedAt: 70,
      completedAttempts: { increment: 1 },
    });
    expect(
      completionPatch({ completedAt: null, unlocked: true }, 70, ops)
    ).toEqual({
      completedAt: 70,
      completedAttempts: { increment: 1 },
      unlocked: false,
    });
    expect(completionPatch(completed, 70, ops)).toBeNull();
  });

  it('unlockPatch reopens and refunds one attempt, never below zero', () => {
    expect(unlockPatch({ completedAt: 5, completedAttempts: 2 }, 80)).toEqual({
      completedAt: null,
      score: null,
      completedAttempts: 1,
      unlocked: true,
      unlockedAt: 80,
    });
    expect(unlockPatch({ completedAt: 5 }, 80)).toMatchObject({
      completedAttempts: 0,
    });
  });
});

describe('selfPacedPlayerReducer', () => {
  const q = { id: 'q1', timestamp: 5 } as VideoActivityPublicQuestion;
  const run = (
    events: SelfPacedPlayerEvent[],
    from: SelfPacedPlayerState = initialSelfPacedPlayerState
  ) => events.reduce(selfPacedPlayerReducer, from);

  it('shows and clears a question', () => {
    const shown = run([{ type: 'questionReached', question: q }]);
    expect(shown.activeQuestion).toBe(q);
    expect(run([{ type: 'questionDone' }], shown).activeQuestion).toBeNull();
  });

  it('a wrong answer rewinds and clears the question', () => {
    const state = run([
      { type: 'questionReached', question: q },
      { type: 'rewind', time: 0, nonce: 7 },
    ]);
    expect(state.activeQuestion).toBeNull();
    expect(state.seekRequest).toEqual({ time: 0, nonce: 7 });
  });

  it('a shut period remounts the overlay and keeps the question', () => {
    const state = run([
      { type: 'questionReached', question: q },
      { type: 'periodFrozen' },
    ]);
    expect(state.activeQuestion).toBe(q);
    expect(state.overlayNonce).toBe(1);
  });

  it('finishing: success shows completion, failure offers Finish and retries', () => {
    const finishing = run([{ type: 'videoEnded' }]);
    expect(selfPacedVideoEnded(finishing)).toBe(true);
    expect(run([{ type: 'completeSucceeded' }], finishing).finish).toBe(
      'finished'
    );
    const retry = run([{ type: 'completeFailed' }], finishing);
    expect(retry.finish).toBe('retry');
    expect(selfPacedVideoEnded(retry)).toBe(false);
    expect(run([{ type: 'videoEnded' }], retry).finish).toBe('finishing');
  });

  it('disallowed events leave the state unchanged', () => {
    const watching = initialSelfPacedPlayerState;
    expect(selfPacedPlayerReducer(watching, { type: 'questionDone' })).toBe(
      watching
    );
    expect(
      selfPacedPlayerReducer(watching, { type: 'completeSucceeded' })
    ).toBe(watching);
    expect(selfPacedPlayerReducer(watching, { type: 'completeFailed' })).toBe(
      watching
    );
    const finished = run([
      { type: 'videoEnded' },
      { type: 'completeSucceeded' },
    ]);
    expect(selfPacedPlayerReducer(finished, { type: 'videoEnded' })).toBe(
      finished
    );
    expect(
      selfPacedPlayerReducer(finished, { type: 'completeSucceeded' })
    ).toBe(finished);
  });
});

describe('teacher and student disagreements (audit A2 section 3)', () => {
  const questions = [
    { id: 'q1', timestamp: 5, text: 'One', type: 'MC', options: ['A', 'B'] },
  ] as VideoActivityPublicQuestion[];

  it('teacher ends a live run while a student is answering: the student sees it end', () => {
    const ended = applyPatch(
      STORED.question,
      livePacingPatch({ type: 'end', playheadSeconds: 6 }, 1, ops) ?? {}
    );
    expect(
      liveTransition(OPEN_Q1, { type: 'end', playheadSeconds: 6 })
    ).toEqual(deriveVaLiveState(ended));
    expect(liveStudentScreen(ended, questions, []).kind).toBe('ended');
  });

  it('a live student reconnecting after the end stays complete', () => {
    const done: VaResponseState = { kind: 'completed', completedAt: 9 };
    expect(liveStudentScreen(STORED.ended, questions, []).kind).toBe('ended');
    expect(
      responseTransition(
        done,
        { type: 'complete', now: 10 },
        {
          completedAt: 9,
        }
      )
    ).toBe(done);
  });

  it('teacher resumes while a student is answering: the question closes for them', () => {
    const resumed = applyPatch(
      STORED.question,
      livePacingPatch({ type: 'resume', playheadSeconds: 7 }, 1, ops) ?? {}
    );
    expect(liveStudentScreen(resumed, questions, []).kind).toBe('watch');
    // The server refused a check that raced the resume: the card shows closed.
    expect(liveStudentScreen(STORED.question, questions, [], 'q1').kind).toBe(
      'closed'
    );
  });

  it('a stale second teacher tab cannot restart an ended run in the table', () => {
    expect(liveTransition(ENDED, { type: 'start' })).toBe(ENDED);
    expect(
      liveTransition(ENDED, {
        type: 'open',
        questionId: 'q1',
        playheadSeconds: 1,
      })
    ).toBe(ENDED);
  });

  it('reveal shows the key to students who answered and to those who missed it', () => {
    const revealed = applyPatch(
      STORED.question,
      livePacingPatch(
        { type: 'reveal', revealed: true, correctAnswer: 'A' },
        1,
        ops
      ) ?? {}
    );
    const answered = liveStudentScreen(revealed, questions, [
      { questionId: 'q1', answer: 'B', answeredAt: 1 },
    ]);
    expect(answered).toMatchObject({ kind: 'revealed' });
    expect(liveStudentScreen(revealed, questions, [])).toMatchObject({
      kind: 'revealed',
      answer: null,
    });
  });

  it('teacher pauses a self-paced run: the session reads paused while students already in keep working', () => {
    expect(deriveVaSessionState({ status: 'ended' }, 'paused')?.mode).toBe(
      'self-paced'
    );
    // Answers are not a state change, so the response stays in progress until the student finishes.
    const inProgress: VaResponseState = { kind: 'in-progress', resumed: false };
    expect(
      responseTransition(inProgress, { type: 'answer' }, { completedAt: null })
    ).toBe(inProgress);
  });

  it('teacher unlocks a student sitting on the completion screen: the attempt reopens', () => {
    const done: VaResponseState = { kind: 'completed', completedAt: 9 };
    const after = deriveVaResponseState({
      completedAt: null,
      ...unlockPatch({ completedAt: 9, completedAttempts: 1 }, 10),
    });
    expect(
      responseTransition(done, { type: 'unlock' }, { completedAt: 9 })
    ).toEqual(after);
  });
});
