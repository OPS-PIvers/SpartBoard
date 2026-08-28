/**
 * Present mode (SSO redesign): the projected screen carries no join code, and
 * names/scores are opt-in per presentation. Covers the six screens' routing
 * rules, the default-off names toggle and its reset-on-reopen guarantee, the
 * live correct-answer lock, and the uncounted projector media path.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type {
  QuizData,
  QuizLeaderboardEntry,
  QuizResponse,
  QuizSession,
  QuizStimulus,
} from '@/types';

// Capture what the projector hands the stimulus renderer — the uncounted path
// is defined by these two props, so assert on them directly.
const stimulusProps: Record<string, unknown>[] = [];
vi.mock('@/components/quiz/QuizStimulusView', () => ({
  StimulusRenderer: (props: Record<string, unknown>) => {
    stimulusProps.push(props);
    return <div data-testid="stimulus" />;
  },
  CollapsibleStimuli: () => null,
}));

import { PresentScreen } from '@/components/widgets/QuizWidget/components/present/PresentScreen';
import { PresentSession } from '@/components/widgets/QuizWidget/components/present/PresentSession';
import { PresentStandings } from '@/components/widgets/QuizWidget/components/present/PresentStandings';
import { QuizPausedPlaceholder } from '@/components/quiz/QuizPausedPlaceholder';

// ─── Fixtures ───────────────────────────────────────────────────────────────
const AUDIO_STIMULUS: QuizStimulus = {
  id: 'stim-1',
  type: 'audio',
  url: 'https://example.test/clip.mp3',
  label: '',
  playLimit: 1,
};

function makeQuizData(): QuizData {
  return {
    id: 'quiz-1',
    title: 'Fractions Review',
    createdAt: 1,
    updatedAt: 1,
    questions: [
      {
        id: 'q1',
        type: 'MC',
        text: 'Add the halves.',
        correctAnswer: '3/4',
        incorrectAnswers: ['5/8', '2/6'],
        timeLimit: 30,
        points: 1,
      },
    ],
  };
}

function makeSession(overrides: Partial<QuizSession> = {}): QuizSession {
  return {
    id: 'sess-1',
    assignmentId: 'a-1',
    quizId: 'quiz-1',
    quizTitle: 'Fractions Review',
    teacherUid: 'teacher-1',
    status: 'active',
    sessionMode: 'teacher',
    currentQuestionIndex: 0,
    startedAt: 1,
    endedAt: null,
    code: 'ABC123',
    totalQuestions: 1,
    publicQuestions: [],
    questionPhase: 'answering',
    ...overrides,
  } as unknown as QuizSession;
}

function makeResponses(): QuizResponse[] {
  const base = {
    sessionId: 'sess-1',
    status: 'completed' as const,
    startedAt: 1,
  };
  return [
    {
      ...base,
      studentUid: 'u1',
      answers: [{ questionId: 'q1', answer: '3/4', timeSpent: 5 }],
    },
    {
      ...base,
      studentUid: 'u2',
      answers: [{ questionId: 'q1', answer: '5/8', timeSpent: 5 }],
    },
  ] as unknown as QuizResponse[];
}

const STANDINGS: QuizLeaderboardEntry[] = [
  { studentUid: 'u1', name: 'Ada Lovelace', score: 940, rank: 1 },
  { studentUid: 'u2', name: 'Grace Hopper', score: 880, rank: 2 },
];

function presentData(overrides: Record<string, unknown> = {}) {
  return {
    session: makeSession(),
    currentQ: makeQuizData().questions[0],
    responses: makeResponses(),
    answered: 2,
    counts: { notStarted: 1, inProgress: 2, done: 3 },
    total: 6,
    standings: STANDINGS,
    isGamified: true,
    classAverage: 82,
    ...overrides,
  } as React.ComponentProps<typeof PresentScreen>;
}

beforeEach(() => {
  stimulusProps.length = 0;
});

// ─── Standings ──────────────────────────────────────────────────────────────
describe('PresentStandings', () => {
  it('shows scores without names by default', () => {
    render(
      <PresentStandings entries={STANDINGS} showNames={false} unit="pts" />
    );
    expect(screen.getByText(/1st — 940 pts/)).toBeInTheDocument();
    expect(screen.queryByText(/Ada/)).not.toBeInTheDocument();
  });

  it('shows first names only when the teacher opts in', () => {
    render(<PresentStandings entries={STANDINGS} showNames unit="pts" />);
    expect(screen.getByText(/1st · Ada — 940 pts/)).toBeInTheDocument();
    expect(screen.queryByText(/Lovelace/)).not.toBeInTheDocument();
  });
});

// ─── Names toggle lifetime ──────────────────────────────────────────────────
describe('Present names toggle', () => {
  let fakeWin: Window;

  beforeEach(() => {
    // Portal into the real document so `screen` can see the projected tree.
    fakeWin = {
      get document() {
        return document;
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      close: () => undefined,
    } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(fakeWin);
  });
  afterEach(() => vi.restoreAllMocks());

  const renderSession = () =>
    render(
      <PresentSession
        {...presentData({
          session: makeSession({ questionPhase: 'reviewing' }),
        })}
        hasMedia={false}
        onSavePauseMessage={vi.fn()}
        onBlocked={vi.fn()}
        onExit={vi.fn()}
      />
    );

  it('starts off and resets to off the next time Present opens', () => {
    const first = renderSession();
    expect(screen.getByRole('button', { name: /names off/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /names off/i }));
    expect(screen.getByRole('button', { name: /names on/i })).toBeTruthy();
    expect(screen.getByText(/· Ada —/)).toBeInTheDocument();
    first.unmount();

    renderSession();
    expect(screen.getByRole('button', { name: /names off/i })).toBeTruthy();
    expect(screen.queryByText(/Ada/)).not.toBeInTheDocument();
  });

  it('reports a blocked popup instead of falling back to fullscreen', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const onBlocked = vi.fn();
    render(
      <PresentSession
        {...presentData()}
        hasMedia={false}
        onSavePauseMessage={vi.fn()}
        onBlocked={onBlocked}
        onExit={vi.fn()}
      />
    );
    expect(onBlocked).toHaveBeenCalled();
    expect(
      screen.queryByRole('region', { name: /present to class/i })
    ).toBeNull();
  });
});

// ─── Screen routing ─────────────────────────────────────────────────────────
describe('PresentScreen', () => {
  it('leads the lobby with wayfinding, then demotes the title to a header', () => {
    const { rerender } = render(
      <PresentScreen
        {...presentData({
          session: makeSession({ status: 'waiting', currentQuestionIndex: -1 }),
        })}
        showNames={false}
      />
    );
    expect(screen.getByText(/Assignments/)).toBeInTheDocument();
    expect(screen.queryByText('Add the halves.')).not.toBeInTheDocument();

    rerender(<PresentScreen {...presentData()} showNames={false} />);
    expect(screen.queryByText(/Sign in, open/)).not.toBeInTheDocument();
    expect(screen.getByText('Add the halves.')).toBeInTheDocument();
    expect(screen.getByText('Fractions Review')).toBeInTheDocument();
  });

  it('never shows the join code', () => {
    render(
      <PresentScreen
        {...presentData({
          session: makeSession({ status: 'waiting', currentQuestionIndex: -1 }),
        })}
        showNames={false}
      />
    );
    expect(screen.queryByText('ABC123')).not.toBeInTheDocument();
  });

  it('renders no answer choices while answering, whatever the shuffle flag', () => {
    for (const shuffleAnswerOptions of [true, false, undefined]) {
      const { unmount } = render(
        <PresentScreen
          {...presentData({ session: makeSession({ shuffleAnswerOptions }) })}
          showNames={false}
        />
      );
      expect(screen.getByText('Add the halves.')).toBeInTheDocument();
      expect(screen.getByText(/2 of 6 answered/)).toBeInTheDocument();
      expect(screen.queryByText('3/4')).not.toBeInTheDocument();
      expect(screen.queryByText('5/8')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('withholds the correct answer in review until it is revealed', () => {
    const reviewing = makeSession({ questionPhase: 'reviewing' });
    const { rerender } = render(
      <PresentScreen
        {...presentData({ session: reviewing })}
        showNames={false}
      />
    );
    expect(screen.getByText('3/4')).toBeInTheDocument();
    expect(screen.queryByLabelText('Correct answer')).not.toBeInTheDocument();

    // showCorrectOnBoard alone is not enough — the teacher must also reveal.
    rerender(
      <PresentScreen
        {...presentData({
          session: makeSession({
            questionPhase: 'reviewing',
            showCorrectOnBoard: true,
          }),
        })}
        showNames={false}
      />
    );
    expect(screen.queryByLabelText('Correct answer')).not.toBeInTheDocument();

    rerender(
      <PresentScreen
        {...presentData({
          session: makeSession({
            questionPhase: 'reviewing',
            showCorrectOnBoard: true,
            revealedAnswers: { q1: '3/4' },
          }),
        })}
        showNames={false}
      />
    );
    expect(screen.getByLabelText('Correct answer')).toBeInTheDocument();
  });

  it('shows self-paced standings only when gamification is on', () => {
    const selfPaced = makeSession({ sessionMode: 'student' });
    const { rerender } = render(
      <PresentScreen
        {...presentData({ session: selfPaced, isGamified: false })}
        showNames={false}
      />
    );
    expect(screen.getByText(/3 of 6/)).toBeInTheDocument();
    expect(screen.queryByText(/Standings/)).not.toBeInTheDocument();

    rerender(
      <PresentScreen
        {...presentData({ session: selfPaced, isGamified: true })}
        showNames={false}
      />
    );
    expect(screen.getByText(/Standings/)).toBeInTheDocument();
  });

  it('shows the pause message on the board', () => {
    render(
      <PresentScreen
        {...presentData({
          session: makeSession({
            status: 'paused',
            pauseMessage: 'Back in 5 minutes',
          }),
        })}
        showNames={false}
      />
    );
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByText('Back in 5 minutes')).toBeInTheDocument();
    expect(screen.queryByText('Add the halves.')).not.toBeInTheDocument();
  });

  it('ends on final standings and class stats', () => {
    render(
      <PresentScreen
        {...presentData({ session: makeSession({ status: 'ended' }) })}
        showNames={false}
      />
    );
    expect(screen.getByText(/Final standings/)).toBeInTheDocument();
    expect(
      screen.getByText(/3 of 6 submitted · class average 82%/)
    ).toBeInTheDocument();
  });

  it('plays projector stimuli on the uncounted path', () => {
    const question = {
      ...makeQuizData().questions[0],
      stimulusIds: ['stim-1'],
    };
    render(
      <PresentScreen
        {...presentData({
          currentQ: question,
          session: makeSession({ stimuli: [AUDIO_STIMULUS] }),
        })}
        showNames={false}
      />
    );
    expect(stimulusProps).toHaveLength(1);
    expect(stimulusProps[0].enforcePlayLimit).toBe(false);
    expect(stimulusProps[0].onPlayCompleted).toBeUndefined();
  });
});

// ─── Student-side pause copy ────────────────────────────────────────────────
describe('QuizPausedPlaceholder', () => {
  it('renders the teacher pause message when present', () => {
    render(
      <QuizPausedPlaceholder
        session={makeSession({
          status: 'paused',
          pauseMessage: 'Back in 5 minutes',
        })}
        pin=""
      />
    );
    expect(screen.getByText('Back in 5 minutes')).toBeInTheDocument();
  });

  it('falls back to the default copy when absent', () => {
    render(
      <QuizPausedPlaceholder
        session={makeSession({ status: 'paused' })}
        pin=""
      />
    );
    expect(screen.getByText('Your answers are saved.')).toBeInTheDocument();
  });
});
