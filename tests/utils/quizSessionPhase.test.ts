import { describe, expect, it } from 'vitest';
import { deleteField, FieldValue } from 'firebase/firestore';
import {
  AUTO_ADVANCE_DELAY_MS,
  checkedQuizSessionWrite,
  deriveQuizSessionPhase,
  sameQuizSessionPhase,
  quizRunState,
  quizSessionWrite,
  reopenIndexPatch,
  type QuizSessionEvent,
  type QuizSessionPhase,
  type QuizSessionPhaseFields,
} from '@/utils/quizSessionPhase';
import {
  assignmentLifecyclePatches,
  transition,
  type LifecycleEvent,
} from '@/utils/sessionLifecycle';

const NOW = 1_700_000_000_000;

function fields(
  overrides: Partial<QuizSessionPhaseFields> = {}
): QuizSessionPhaseFields {
  return {
    status: 'active',
    sessionMode: 'teacher',
    currentQuestionIndex: 0,
    totalQuestions: 3,
    startedAt: 1000,
    questionPhase: 'answering',
    autoProgressAt: null,
    showPodiumBetweenQuestions: false,
    ...overrides,
  };
}

// Applies a write the way Firestore would, so the next phase is read back from stored fields.
function apply(
  session: QuizSessionPhaseFields,
  patch: Record<string, unknown>
): QuizSessionPhaseFields {
  const next: Record<string, unknown> = { ...session };
  for (const [key, value] of Object.entries(patch)) {
    if (value instanceof FieldValue && value.isEqual(deleteField())) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next as unknown as QuizSessionPhaseFields;
}

function step(session: QuizSessionPhaseFields, event: QuizSessionEvent) {
  const write = quizSessionWrite(session, event, NOW);
  return {
    write,
    next: write ? apply(session, write.patch) : session,
  };
}

const phaseOf = (s: QuizSessionPhaseFields) => deriveQuizSessionPhase(s);
function mustPhase(s: QuizSessionPhaseFields): QuizSessionPhase {
  const phase = deriveQuizSessionPhase(s);
  if (!phase) throw new Error('no phase');
  return phase;
}

// One stored session per phase the union can describe.
const SESSIONS: Record<string, QuizSessionPhaseFields> = {
  lobby: fields({
    status: 'waiting',
    currentQuestionIndex: -1,
    startedAt: null,
  }),
  teacherAnswering: fields(),
  teacherAnsweringPodium: fields({ showPodiumBetweenQuestions: true }),
  teacherReviewing: fields({
    showPodiumBetweenQuestions: true,
    questionPhase: 'reviewing',
  }),
  autoAnswering: fields({ sessionMode: 'auto' }),
  autoAnsweringPodium: fields({
    sessionMode: 'auto',
    showPodiumBetweenQuestions: true,
  }),
  autoArmed: fields({ sessionMode: 'auto', autoProgressAt: NOW - 1 }),
  autoReviewing: fields({
    sessionMode: 'auto',
    showPodiumBetweenQuestions: true,
    questionPhase: 'reviewing',
    autoProgressAt: NOW - 1,
  }),
  lastQuestion: fields({ currentQuestionIndex: 2 }),
  selfPaced: fields({
    sessionMode: 'student',
    showPodiumBetweenQuestions: true,
  }),
  game: fields({ sessionMode: 'game' }),
  pausedQuestion: fields({ status: 'paused', currentQuestionIndex: 1 }),
  pausedLobby: fields({
    status: 'paused',
    currentQuestionIndex: -1,
    startedAt: null,
  }),
  endedManual: fields({ status: 'ended', currentQuestionIndex: 1 }),
  endedNatural: fields({
    status: 'ended',
    currentQuestionIndex: 3,
    questionPhase: undefined,
  }),
};

const EVENTS: QuizSessionEvent[] = [
  { type: 'advance' },
  { type: 'end' },
  { type: 'everyoneAnswered' },
];

const ENDED_NATURAL: QuizSessionPhase = { kind: 'ended', natural: true };
const ENDED_MANUAL: QuizSessionPhase = { kind: 'ended', natural: false };
const teacherQ = (
  index: number,
  stepName: 'answering' | 'reviewing' = 'answering'
): QuizSessionPhase => ({
  kind: 'question',
  pacing: 'teacher',
  index,
  step: stepName,
  autoAdvanceAt: null,
});
const autoQ = (
  index: number,
  stepName: 'answering' | 'reviewing',
  autoAdvanceAt: number | null
): QuizSessionPhase => ({
  kind: 'question',
  pacing: 'auto',
  index,
  step: stepName,
  autoAdvanceAt,
});

// Every allowed move, keyed `${session}|${event}`; anything missing must leave the session untouched.
const ALLOWED: Record<string, QuizSessionPhase> = {
  'lobby|advance': teacherQ(0),
  'lobby|end': ENDED_MANUAL,
  'teacherAnswering|advance': teacherQ(1),
  'teacherAnswering|end': ENDED_MANUAL,
  'teacherAnsweringPodium|advance': teacherQ(0, 'reviewing'),
  'teacherAnsweringPodium|end': ENDED_MANUAL,
  'teacherReviewing|advance': teacherQ(1),
  'teacherReviewing|end': ENDED_MANUAL,
  'autoAnswering|advance': autoQ(1, 'answering', null),
  'autoAnswering|end': ENDED_MANUAL,
  'autoAnswering|everyoneAnswered': autoQ(
    0,
    'answering',
    NOW + AUTO_ADVANCE_DELAY_MS
  ),
  'autoAnsweringPodium|advance': autoQ(0, 'reviewing', null),
  'autoAnsweringPodium|end': ENDED_MANUAL,
  'autoAnsweringPodium|everyoneAnswered': autoQ(
    0,
    'reviewing',
    NOW + AUTO_ADVANCE_DELAY_MS
  ),
  'autoArmed|advance': autoQ(1, 'answering', null),
  'autoArmed|end': ENDED_MANUAL,
  'autoReviewing|advance': autoQ(1, 'answering', null),
  'autoReviewing|end': ENDED_MANUAL,
  'lastQuestion|advance': ENDED_NATURAL,
  'lastQuestion|end': ENDED_MANUAL,
  'selfPaced|advance': { kind: 'selfPaced', index: 1 },
  'selfPaced|end': ENDED_MANUAL,
  'game|advance': { kind: 'game', index: 1, step: 'answering' },
  'game|end': ENDED_MANUAL,
  'pausedQuestion|end': ENDED_MANUAL,
  'pausedLobby|end': ENDED_MANUAL,
  'endedManual|end': ENDED_MANUAL,
  'endedNatural|end': ENDED_NATURAL,
};

describe('deriveQuizSessionPhase', () => {
  it('reads every phase from the stored fields', () => {
    expect(phaseOf(SESSIONS.lobby)).toEqual({ kind: 'lobby', index: -1 });
    expect(phaseOf(SESSIONS.teacherAnswering)).toEqual(teacherQ(0));
    expect(phaseOf(SESSIONS.teacherReviewing)).toEqual(
      teacherQ(0, 'reviewing')
    );
    expect(phaseOf(SESSIONS.autoArmed)).toEqual(autoQ(0, 'answering', NOW - 1));
    expect(phaseOf(SESSIONS.selfPaced)).toEqual({
      kind: 'selfPaced',
      index: 0,
    });
    expect(phaseOf(SESSIONS.game)).toEqual({
      kind: 'game',
      index: 0,
      step: 'answering',
    });
    expect(phaseOf(SESSIONS.pausedQuestion)).toEqual({
      kind: 'paused',
      resumeTo: 'question',
      index: 1,
    });
    expect(phaseOf(SESSIONS.pausedLobby)).toEqual({
      kind: 'paused',
      resumeTo: 'lobby',
      index: -1,
    });
    expect(phaseOf(SESSIONS.endedManual)).toEqual(ENDED_MANUAL);
    expect(phaseOf(SESSIONS.endedNatural)).toEqual(ENDED_NATURAL);
  });

  it('treats a paused session that never left the lobby as resuming to the lobby', () => {
    expect(
      phaseOf(
        fields({ status: 'paused', startedAt: null, currentQuestionIndex: 0 })
      )
    ).toMatchObject({ kind: 'paused', resumeTo: 'lobby' });
  });

  it('returns null for a status Quiz never writes', () => {
    expect(
      phaseOf(fields({ status: 'closed' as unknown as 'active' }))
    ).toBeNull();
  });

  it('places every phase in the shared run state', () => {
    expect(quizRunState(mustPhase(SESSIONS.lobby))).toEqual({
      phase: 'waiting',
    });
    expect(quizRunState(mustPhase(SESSIONS.game))).toEqual({ phase: 'active' });
    expect(quizRunState(mustPhase(SESSIONS.pausedLobby))).toEqual({
      phase: 'paused',
      resumeTo: 'waiting',
    });
    expect(quizRunState(mustPhase(SESSIONS.endedNatural))).toEqual({
      phase: 'ended',
    });
  });
});

describe('quizSessionWrite transition table', () => {
  for (const [name, session] of Object.entries(SESSIONS)) {
    for (const event of EVENTS) {
      const key = `${name}|${event.type}`;
      const expected = ALLOWED[key];
      if (expected) {
        it(`${key} moves to ${expected.kind}`, () => {
          const { write, next } = step(session, event);
          expect(write).not.toBeNull();
          expect(phaseOf(next)).toEqual(expected);
        });
      } else {
        it(`${key} is refused and writes nothing`, () => {
          const { write, next } = step(session, event);
          expect(write).toBeNull();
          expect(next).toBe(session);
        });
      }
    }
  }

  it('only ever makes a run-state move the shared lifecycle allows', () => {
    const asLifecycle: Record<QuizSessionEvent['type'], LifecycleEvent> = {
      advance: { type: 'start' },
      end: { type: 'end' },
      everyoneAnswered: { type: 'start' },
    };
    for (const session of Object.values(SESSIONS)) {
      for (const event of EVENTS) {
        const { write, next } = step(session, event);
        if (!write) continue;
        const from = quizRunState(mustPhase(session));
        const to = quizRunState(mustPhase(next));
        if (JSON.stringify(from) === JSON.stringify(to)) continue;
        const shared =
          to.phase === 'ended'
            ? transition('quiz', from, { type: 'end' })
            : transition('quiz', from, asLifecycle[event.type]);
        expect(shared).toEqual(to);
      }
    }
  });
});

describe('quizSessionWrite patches', () => {
  it('starts from the lobby with startedAt stamped once', () => {
    expect(quizSessionWrite(SESSIONS.lobby, { type: 'advance' }, NOW)).toEqual({
      patch: {
        status: 'active',
        currentQuestionIndex: 0,
        autoProgressAt: null,
        questionPhase: 'answering',
        startedAt: NOW,
      },
      finalize: false,
    });
    const later = quizSessionWrite(
      SESSIONS.teacherAnswering,
      { type: 'advance' },
      NOW
    );
    expect(later?.patch).not.toHaveProperty('startedAt');
  });

  it('enters review without moving the index when podium is on', () => {
    expect(
      quizSessionWrite(
        SESSIONS.teacherAnsweringPodium,
        { type: 'advance' },
        NOW
      )
    ).toEqual({
      patch: { questionPhase: 'reviewing', autoProgressAt: null },
      finalize: false,
    });
  });

  it('ends naturally past the last question and asks for the finalize', () => {
    const write = quizSessionWrite(
      SESSIONS.lastQuestion,
      { type: 'advance' },
      NOW
    );
    expect(write?.finalize).toBe(true);
    expect(write?.patch).toMatchObject({
      status: 'ended',
      endedAt: NOW,
      autoProgressAt: null,
      currentQuestionIndex: 3,
    });
    expect(
      (write?.patch.questionPhase as FieldValue).isEqual(deleteField())
    ).toBe(true);
  });

  it('writes the shared end patch for End', () => {
    expect(
      quizSessionWrite(SESSIONS.pausedQuestion, { type: 'end' }, NOW)
    ).toEqual({
      patch: { status: 'ended', endedAt: NOW, autoProgressAt: null },
      finalize: true,
    });
  });

  it('arms auto-advance five seconds out, with review when podium is on', () => {
    expect(
      quizSessionWrite(
        SESSIONS.autoAnswering,
        { type: 'everyoneAnswered' },
        NOW
      )?.patch
    ).toEqual({ autoProgressAt: NOW + AUTO_ADVANCE_DELAY_MS });
    expect(
      quizSessionWrite(
        SESSIONS.autoAnsweringPodium,
        { type: 'everyoneAnswered' },
        NOW
      )?.patch
    ).toEqual({
      autoProgressAt: NOW + AUTO_ADVANCE_DELAY_MS,
      questionPhase: 'reviewing',
    });
  });
});

// Teacher and student disagreement cases from the widget state audit (A1 §3).
describe('quizSessionWrite in the audit disagreement cases', () => {
  it('two teacher tabs pressing Next on the same question write the same absolute values', () => {
    const a = quizSessionWrite(
      SESSIONS.teacherAnswering,
      { type: 'advance' },
      NOW
    );
    const b = quizSessionWrite(
      SESSIONS.teacherAnswering,
      { type: 'advance' },
      NOW
    );
    expect(a).toEqual(b);
    expect(a?.patch.currentQuestionIndex).toBe(1);
  });

  it('a stale tab still showing the last question ends again rather than resurrecting the run', () => {
    const { next } = step(SESSIONS.lastQuestion, { type: 'advance' });
    expect(phaseOf(next)).toEqual(ENDED_NATURAL);
    expect(quizSessionWrite(next, { type: 'advance' }, NOW)).toBeNull();
  });

  it('pausing mid-answer stops Next and auto-advance until Resume', () => {
    expect(
      quizSessionWrite(SESSIONS.pausedQuestion, { type: 'advance' }, NOW)
    ).toBeNull();
    expect(
      quizSessionWrite(
        fields({ status: 'paused', sessionMode: 'auto' }),
        { type: 'everyoneAnswered' },
        NOW
      )
    ).toBeNull();
  });

  it('a teacher ending while students are mid-question finalizes their work', () => {
    for (const name of ['teacherAnswering', 'autoArmed', 'selfPaced', 'game']) {
      expect(
        quizSessionWrite(SESSIONS[name], { type: 'end' }, NOW)?.finalize
      ).toBe(true);
    }
    expect(
      quizSessionWrite(SESSIONS.teacherAnswering, { type: 'advance' }, NOW)
        ?.finalize
    ).toBe(false);
  });

  it('a reload after the session ended offers no Next or auto-advance', () => {
    for (const name of ['endedManual', 'endedNatural']) {
      expect(
        quizSessionWrite(SESSIONS[name], { type: 'advance' }, NOW)
      ).toBeNull();
      expect(
        quizSessionWrite(SESSIONS[name], { type: 'everyoneAnswered' }, NOW)
      ).toBeNull();
    }
  });

  it('End on an ended session finalizes again, finishing an interrupted finalize', () => {
    expect(
      quizSessionWrite(SESSIONS.endedNatural, { type: 'end' }, NOW)?.finalize
    ).toBe(true);
  });

  it('auto mode arms once: a second everyone-answered while armed or reviewing does nothing', () => {
    expect(
      quizSessionWrite(SESSIONS.autoArmed, { type: 'everyoneAnswered' }, NOW)
    ).toBeNull();
    expect(
      quizSessionWrite(
        SESSIONS.autoReviewing,
        { type: 'everyoneAnswered' },
        NOW
      )
    ).toBeNull();
  });

  it('teacher-paced, self-paced and game sessions never auto-advance', () => {
    for (const name of ['teacherAnswering', 'selfPaced', 'game', 'lobby']) {
      expect(
        quizSessionWrite(SESSIONS[name], { type: 'everyoneAnswered' }, NOW)
      ).toBeNull();
    }
  });

  it('a stored active session already past the last question ends on the next advance', () => {
    const { next } = step(fields({ currentQuestionIndex: 3 }), {
      type: 'advance',
    });
    expect(phaseOf(next)).toEqual(ENDED_NATURAL);
  });
});

describe('reopenIndexPatch', () => {
  it('puts a natural end back in range: lobby for teacher-paced, first question for self-paced', () => {
    expect(reopenIndexPatch(fields({ currentQuestionIndex: 3 }))).toEqual({
      currentQuestionIndex: -1,
      questionPhase: 'answering',
    });
    expect(
      reopenIndexPatch(
        fields({ currentQuestionIndex: 3, sessionMode: 'student' })
      )
    ).toEqual({ currentQuestionIndex: 0, questionPhase: 'answering' });
  });

  it('keeps the index after a manual end or for a quiz with no questions', () => {
    expect(reopenIndexPatch(fields({ currentQuestionIndex: 1 }))).toEqual({});
    expect(
      reopenIndexPatch(fields({ currentQuestionIndex: 0, totalQuestions: 0 }))
    ).toEqual({});
  });

  it('reopens a natural end into a pause that resumes to the lobby', () => {
    const reopened = apply(SESSIONS.endedNatural, {
      ...assignmentLifecyclePatches('quiz', { type: 'reopen' }, NOW).session,
      ...reopenIndexPatch(SESSIONS.endedNatural),
    });
    expect(phaseOf(reopened)).toEqual({
      kind: 'paused',
      resumeTo: 'lobby',
      index: -1,
    });
  });
});

describe('checkedQuizSessionWrite', () => {
  it('writes when the stored session is still on the step the teacher saw', () => {
    expect(
      checkedQuizSessionWrite(
        SESSIONS.teacherAnswering,
        SESSIONS.teacherAnswering,
        { type: 'advance' },
        NOW
      )
    ).toEqual(
      quizSessionWrite(SESSIONS.teacherAnswering, { type: 'advance' }, NOW)
    );
  });

  it('writes nothing when another tab already advanced, reviewed, paused or ended the run', () => {
    const moved = [
      fields({ currentQuestionIndex: 1 }),
      fields({ questionPhase: 'reviewing' }),
      SESSIONS.pausedQuestion,
      SESSIONS.endedManual,
    ];
    for (const stored of moved) {
      expect(
        checkedQuizSessionWrite(
          SESSIONS.teacherAnswering,
          stored,
          { type: 'advance' },
          NOW
        )
      ).toBeNull();
    }
  });

  it('writes nothing when the session doc is gone', () => {
    expect(
      checkedQuizSessionWrite(
        SESSIONS.teacherAnswering,
        undefined,
        { type: 'advance' },
        NOW
      )
    ).toBeNull();
  });

  it('lets Next through when only the auto-advance timer changed underneath it', () => {
    expect(
      checkedQuizSessionWrite(
        SESSIONS.autoAnswering,
        SESSIONS.autoArmed,
        { type: 'advance' },
        NOW
      )?.patch.currentQuestionIndex
    ).toBe(1);
  });

  it('arms auto-advance once across tabs: the second tab sees it already armed', () => {
    expect(
      checkedQuizSessionWrite(
        SESSIONS.autoAnswering,
        SESSIONS.autoArmed,
        { type: 'everyoneAnswered' },
        NOW
      )
    ).toBeNull();
  });
});

describe('sameQuizSessionPhase', () => {
  it('ignores only the auto-advance time', () => {
    expect(
      sameQuizSessionPhase(
        mustPhase(SESSIONS.autoAnswering),
        mustPhase(SESSIONS.autoArmed)
      )
    ).toBe(true);
    expect(
      sameQuizSessionPhase(
        mustPhase(SESSIONS.teacherAnswering),
        mustPhase(SESSIONS.teacherReviewing)
      )
    ).toBe(false);
    expect(sameQuizSessionPhase(null, null)).toBe(true);
    expect(sameQuizSessionPhase(mustPhase(SESSIONS.lobby), null)).toBe(false);
  });
});
