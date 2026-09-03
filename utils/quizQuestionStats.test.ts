import { describe, it, expect } from 'vitest';
import type { QuizQuestion, QuizResponse } from '@/types';
import {
  computeQuestionStats,
  type QuestionStat,
} from '@/utils/quizQuestionStats';

const statFor = (m: Map<string, QuestionStat>, id: string): QuestionStat => {
  const s = m.get(id);
  if (!s) throw new Error(`no stat for ${id}`);
  return s;
};

const RECORDING = {
  prepSeconds: 30,
  limitSeconds: 60,
  prepExpiry: 'armed' as const,
  takeLimit: null,
};

const frq = (id: string, points = 10): QuizQuestion =>
  ({
    id,
    type: 'free-response',
    text: `Explain ${id}`,
    correctAnswer: '',
    incorrectAnswers: [],
    timeLimit: 0,
    points,
  }) as unknown as QuizQuestion;

const mc = (id: string, points = 2): QuizQuestion =>
  ({
    id,
    type: 'MC',
    text: `Pick ${id}`,
    correctAnswer: 'a',
    incorrectAnswers: ['b'],
    timeLimit: 0,
    points,
  }) as unknown as QuizQuestion;

const response = (
  uid: string,
  answers: QuizResponse['answers'],
  grading?: QuizResponse['grading'],
  extra: Partial<QuizResponse> = {}
): QuizResponse =>
  ({
    studentUid: uid,
    _responseKey: uid,
    status: 'completed',
    submittedAt: 1,
    tabSwitchWarnings: 0,
    answers,
    ...(grading ? { grading } : {}),
    ...extra,
  }) as unknown as QuizResponse;

const answer = (questionId: string, text = 'my answer') => ({
  questionId,
  answer: text,
  answeredAt: 1,
});

describe('computeQuestionStats', () => {
  it('averages earned ratio over graded FRQ responses and drops ungraded ones', () => {
    const stats = statFor(
      computeQuestionStats(
        [frq('q1')],
        [
          response('a', [answer('q1')], {
            q1: { pointsAwarded: 8, gradedBy: 't', gradedAt: 1 },
          }),
          response('b', [answer('q1')], {
            q1: { pointsAwarded: 6, gradedBy: 't', gradedAt: 1 },
          }),
          response('c', [answer('q1')]),
        ]
      ),
      'q1'
    );
    expect(stats.averagePct).toBe(70);
    expect(stats.scoredCount).toBe(2);
    expect(stats.graded).toBe(2);
    expect(stats.manualTotal).toBe(3);
    expect(stats.answered).toBe(3);
  });

  it('reports null when nothing is graded yet', () => {
    const stats = statFor(
      computeQuestionStats(
        [frq('q1')],
        [response('a', [answer('q1')]), response('b', [answer('q1')])]
      ),
      'q1'
    );
    expect(stats.averagePct).toBeNull();
    expect(stats.scoredCount).toBe(0);
    expect(stats.manualTotal).toBe(2);
  });

  it('excludes an excused response from the mean', () => {
    const q = { ...frq('q1'), recording: RECORDING } as QuizQuestion;
    const stats = statFor(
      computeQuestionStats(
        [q],
        [
          response('a', [answer('q1')], {
            q1: { pointsAwarded: 5, gradedBy: 't', gradedAt: 1 },
          }),
          response('b', [answer('q1')], {
            q1: { pointsAwarded: 0, excused: true, gradedBy: 't', gradedAt: 1 },
          }),
        ]
      ),
      'q1'
    );
    expect(stats.averagePct).toBe(50);
    expect(stats.scoredCount).toBe(1);
  });

  it('matches percent-correct for a pure auto-graded question', () => {
    const stats = statFor(
      computeQuestionStats(
        [mc('q1')],
        [
          response('a', [answer('q1', 'a')]),
          response('b', [answer('q1', 'b')]),
          response('c', [answer('q1', 'a')]),
          response('d', [answer('q1', 'a')]),
        ]
      ),
      'q1'
    );
    expect(stats.autoTotal).toBe(4);
    expect(stats.correct).toBe(3);
    expect(stats.averagePct).toBe(75);
  });

  it('combines the auto primary and a graded addendum into one ratio', () => {
    const q = { ...mc('q1', 4), recording: RECORDING } as QuizQuestion;
    const withAddendum = (uid: string, choice: string, addendumPts?: number) =>
      response(
        uid,
        [
          {
            questionId: 'q1',
            answer: choice,
            answeredAt: 1,
            artifacts: [
              {
                id: `art-${uid}`,
                slot: 'addendum',
                kind: 'audio',
                uploadState: 'uploaded',
                durationMs: 1000,
              },
            ],
          } as unknown as QuizResponse['answers'][number],
        ],
        addendumPts === undefined
          ? undefined
          : {
              'q1::addendum': {
                pointsAwarded: addendumPts,
                gradedBy: 't',
                gradedAt: 1,
              },
            }
      );
    const stats = statFor(
      computeQuestionStats(
        [q],
        [withAddendum('a', 'b', 2), withAddendum('b', 'a', 0)]
      ),
      'q1'
    );
    // a: 0 + 2 of 4 = 50%; b: 4 + 0 clamped to 4 of 4 = 100%.
    expect(stats.averagePct).toBe(75);
    expect(stats.autoTotal).toBe(2);
    expect(stats.correct).toBe(1);
    expect(stats.manualTotal).toBe(2);
    expect(stats.graded).toBe(2);
  });

  it('holds a mixed question out of the mean while its addendum is ungraded', () => {
    const q = { ...mc('q1', 4), recording: RECORDING } as QuizQuestion;
    const stats = statFor(
      computeQuestionStats(
        [q],
        [
          response('a', [
            {
              questionId: 'q1',
              answer: 'a',
              answeredAt: 1,
              artifacts: [
                {
                  id: 'art-a',
                  slot: 'addendum',
                  kind: 'audio',
                  uploadState: 'uploaded',
                  durationMs: 1000,
                },
              ],
            } as unknown as QuizResponse['answers'][number],
          ]),
        ]
      ),
      'q1'
    );
    expect(stats.averagePct).toBeNull();
    expect(stats.correct).toBe(1);
    expect(stats.graded).toBe(0);
  });

  it('skips passed-over entries and dedupes repeated question ids', () => {
    const stats = computeQuestionStats(
      [mc('q1'), mc('q1')],
      [
        response('a', [
          {
            questionId: 'q1',
            answer: '',
            answeredAt: 1,
            unresponded: 'passed',
          },
        ] as unknown as QuizResponse['answers']),
      ]
    );
    expect(stats.size).toBe(1);
    expect(statFor(stats, 'q1').answered).toBe(0);
    expect(statFor(stats, 'q1').averagePct).toBeNull();
  });
});
