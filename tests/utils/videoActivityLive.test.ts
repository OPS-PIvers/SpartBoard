import { describe, it, expect } from 'vitest';
import type { VideoActivityQuestion } from '@/types';
import {
  computeSkippedOnSeek,
  initialVideoActivityLiveState,
  isLiveVideoActivitySession,
  liveQuestionState,
  questionCrossed,
  scoredVideoActivityQuestions,
  whoHasntAnswered,
} from '@/utils/videoActivityLive';
import { computeVideoActivityScorePct } from '@/utils/videoActivityGrading';

const q = (id: string, correctAnswer = 'A'): VideoActivityQuestion => ({
  id,
  timestamp: 0,
  text: id,
  type: 'MC',
  correctAnswer,
  incorrectAnswers: ['B'],
  timeLimit: 0,
  points: 1,
});

const questions = [q('q1'), q('q2'), q('q3')];

describe('videoActivityLive', () => {
  it('treats sessions without sessionMode as self-paced', () => {
    expect(isLiveVideoActivitySession({})).toBe(false);
    expect(isLiveVideoActivitySession({ sessionMode: 'student' })).toBe(false);
    expect(isLiveVideoActivitySession({ sessionMode: 'teacher' })).toBe(true);
    expect(isLiveVideoActivitySession(null)).toBe(false);
  });

  it('scores self-paced sessions over every question', () => {
    expect(scoredVideoActivityQuestions({}, questions)).toBe(questions);
  });

  it('scores live sessions over asked questions only', () => {
    const live = {
      ...initialVideoActivityLiveState(0),
      askedQuestionIds: ['q1', 'q3'],
      skippedQuestionIds: ['q2'],
    };
    const scored = scoredVideoActivityQuestions(
      { sessionMode: 'teacher', live },
      questions
    );
    expect(scored.map((x) => x.id)).toEqual(['q1', 'q3']);
    // Asked-but-missed q3 scores 0; skipped q2 is not in the denominator.
    expect(
      computeVideoActivityScorePct(scored, [{ questionId: 'q1', answer: 'A' }])
    ).toBe(50);
  });

  it('scores a live session with nothing asked over no questions', () => {
    expect(
      scoredVideoActivityQuestions(
        { sessionMode: 'teacher', live: initialVideoActivityLiveState(0) },
        questions
      )
    ).toEqual([]);
  });
});

const timed = [
  { id: 'a', timestamp: 10 },
  { id: 'b', timestamp: 20 },
  { id: 'c', timestamp: 30 },
];
const pacing = (asked: string[] = [], skipped: string[] = []) => ({
  askedQuestionIds: asked,
  skippedQuestionIds: skipped,
});

describe('computeSkippedOnSeek', () => {
  it('skips unopened questions in (prev, next]', () => {
    expect(computeSkippedOnSeek(5, 20, timed, pacing())).toEqual(
      pacing([], ['a', 'b'])
    );
  });

  it('excludes the lower bound and includes the upper bound', () => {
    expect(computeSkippedOnSeek(10, 19.9, timed, pacing())).toEqual(
      pacing([], [])
    );
    expect(computeSkippedOnSeek(10, 20, timed, pacing())).toEqual(
      pacing([], ['b'])
    );
  });

  it('never skips a question that was already asked', () => {
    expect(computeSkippedOnSeek(0, 35, timed, pacing(['b']))).toEqual(
      pacing(['b'], ['a', 'c'])
    );
  });

  it('does not duplicate already-skipped ids', () => {
    expect(computeSkippedOnSeek(0, 35, timed, pacing([], ['a']))).toEqual(
      pacing([], ['a', 'b', 'c'])
    );
  });

  it('changes nothing on a backward or zero seek', () => {
    const before = pacing(['a'], ['b']);
    expect(computeSkippedOnSeek(35, 5, timed, before)).toEqual(before);
    expect(computeSkippedOnSeek(12, 12, timed, before)).toEqual(before);
  });

  it('does not mutate its input', () => {
    const before = pacing([], []);
    computeSkippedOnSeek(0, 40, timed, before);
    expect(before).toEqual(pacing([], []));
  });
});

describe('questionCrossed', () => {
  it('returns the question whose timestamp playback crossed', () => {
    expect(questionCrossed(9.75, 10, timed, pacing())?.id).toBe('a');
    expect(questionCrossed(9.5, 9.75, timed, pacing())).toBeNull();
  });

  it('returns the earliest when several are crossed at once', () => {
    expect(questionCrossed(0, 25, [...timed].reverse(), pacing())?.id).toBe(
      'a'
    );
  });

  it('ignores asked and skipped questions', () => {
    expect(questionCrossed(0, 25, timed, pacing(['a']))?.id).toBe('b');
    expect(questionCrossed(0, 25, timed, pacing(['a'], ['b']))).toBeNull();
  });

  it('never fires backward', () => {
    expect(questionCrossed(25, 5, timed, pacing())).toBeNull();
  });
});

describe('liveQuestionState', () => {
  const live = {
    currentQuestionId: 'a',
    questionPhase: 'open' as const,
    askedQuestionIds: ['a', 'b'],
    skippedQuestionIds: ['c'],
  };
  it('labels open, closed, skipped and upcoming questions', () => {
    expect(liveQuestionState('a', live)).toBe('open');
    expect(liveQuestionState('b', live)).toBe('closed');
    expect(liveQuestionState('c', live)).toBe('skipped');
    expect(liveQuestionState('d', live)).toBe('upcoming');
    expect(liveQuestionState('a', { ...live, questionPhase: 'closed' })).toBe(
      'closed'
    );
  });
});

describe('whoHasntAnswered', () => {
  const roster = [
    { firstName: 'Ada', lastName: 'Lovelace', pin: '01' },
    { firstName: 'Bo', lastName: 'Diddley', pin: '02' },
    { firstName: 'Cy', lastName: 'Young', pin: '03' },
  ];
  it('lists joined students without an answer and roster students not joined', () => {
    const result = whoHasntAnswered(
      'q1',
      [
        { pin: '01', studentUid: 'u1', answers: [{ questionId: 'q1' }] },
        { studentUid: 'u2', answers: [] },
      ],
      roster,
      new Map([['u2', { givenName: 'Bo', familyName: 'Diddley' }]])
    );
    expect(result).toEqual({
      notAnswered: ['Bo Diddley'],
      notJoined: ['Cy Young'],
    });
  });

  it('labels a PIN joiner by roster name', () => {
    const result = whoHasntAnswered(
      'q1',
      [{ pin: '03', studentUid: 'u3', answers: [] }],
      roster,
      new Map()
    );
    expect(result.notAnswered).toEqual(['Cy Young']);
    expect(result.notJoined).toEqual(['Ada Lovelace', 'Bo Diddley']);
  });
});
