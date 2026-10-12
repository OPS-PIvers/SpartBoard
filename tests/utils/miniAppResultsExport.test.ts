// Mini App results sheet export maps best attempts onto the Quiz exporter (docs/plans/MINI_APP_RESULTS.md D10).
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ exportResultsToSheet: vi.fn() }));
vi.mock('@/utils/quizDriveService', () => ({
  QuizDriveService: class {
    exportResultsToSheet = h.exportResultsToSheet;
  },
}));

import { exportMiniAppResults } from '@/utils/miniAppResultsExport';

type GradeFn = (q: { id: string; points?: number }, a: string) => unknown;

describe('exportMiniAppResults', () => {
  it('exports per-question marks as points', async () => {
    h.exportResultsToSheet.mockResolvedValue('url');
    await exportMiniAppResults(
      't',
      'Fractions',
      [
        {
          id: 'p1',
          lastSubmittedAt: 1,
          best: {
            score: 1,
            maxScore: 2,
            attemptNo: 1,
            gradedBy: 'server',
            items: [
              { id: 'q1', correct: true, by: 'server' },
              { id: 'q2', correct: false, by: 'server' },
            ],
          },
        },
      ],
      [
        { id: 'q1', type: 'mc', prompt: 'One' },
        { id: 'q2', type: 'tf', prompt: 'Two', points: 2 },
      ]
    );
    const [, responses, questions, opts] = h.exportResultsToSheet.mock
      .calls[0] as [
      string,
      { answers: unknown[] }[],
      unknown[],
      { gradeFn: GradeFn },
    ];
    expect(responses[0].answers).toEqual([
      { questionId: 'q1', answer: 'Correct' },
      { questionId: 'q2', answer: 'Incorrect' },
    ]);
    expect(questions).toEqual([
      { id: 'q1', text: 'One', points: 1 },
      { id: 'q2', text: 'Two', points: 2 },
    ]);
    expect(opts.gradeFn({ id: 'q2', points: 2 }, 'Correct')).toMatchObject({
      pointsEarned: 2,
      state: 'scored',
    });
  });

  it('uses one Score column out of 100 when the app has no question list', async () => {
    h.exportResultsToSheet.mockResolvedValue('url');
    await exportMiniAppResults(
      't',
      'Pizza',
      [
        {
          id: 'p1',
          lastSubmittedAt: 1,
          best: { score: 3, maxScore: 4, attemptNo: 1, gradedBy: 'app' },
        },
      ],
      []
    );
    const [, responses, questions, opts] = h.exportResultsToSheet.mock
      .calls[0] as [
      string,
      { answers: { questionId: string; answer: string }[] }[],
      { id: string }[],
      { gradeFn: GradeFn },
    ];
    expect(questions).toHaveLength(1);
    const answer = responses[0].answers[0].answer;
    expect(
      opts.gradeFn({ ...questions[0], points: 100 }, answer)
    ).toMatchObject({
      pointsEarned: 75,
    });
  });
});
