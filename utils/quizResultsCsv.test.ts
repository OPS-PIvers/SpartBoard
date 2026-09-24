import { describe, it, expect } from 'vitest';
import type { QuizQuestion, QuizResponse } from '@/types';
import { buildQuizResultsCsv } from '@/utils/quizResultsCsv';

const questions = [
  {
    id: 'q1',
    type: 'MC',
    text: 'Capital of France?',
    correctAnswer: 'Paris',
    incorrectAnswers: ['Rome'],
    timeLimit: 0,
    points: 1,
  },
] as unknown as QuizQuestion[];

const response = (pin: string, answer: string) =>
  ({
    studentUid: `uid-${pin}`,
    pin,
    status: 'completed',
    submittedAt: 2,
    joinedAt: 1,
    answers: [{ questionId: 'q1', answer, answeredAt: 1 }],
  }) as unknown as QuizResponse;

describe('buildQuizResultsCsv', () => {
  it('writes a header and one row per student with their answer', () => {
    const csv = buildQuizResultsCsv(
      [response('1111', 'Rome'), response('2222', 'Paris')],
      questions,
      { pinToName: { '1111': 'Ada Lovelace' } }
    );
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Q1 Answer');
    expect(lines[1]).toContain('Ada Lovelace');
    expect(lines[1]).toContain('Rome');
  });

  it('defuses spreadsheet formulas in answers', () => {
    const csv = buildQuizResultsCsv([response('1111', '=1+1')], questions);
    expect(csv).toContain("'=1+1");
    expect(csv).not.toMatch(/(^|,)=1\+1/m);
  });
});
