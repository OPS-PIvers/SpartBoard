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

describe('buildQuizResultsCsv final score', () => {
  it('adds a Final score column only when a resolver is passed', () => {
    const rows = [response('1111', 'Rome'), response('2222', 'Paris')];
    const plain = buildQuizResultsCsv(rows, questions).split('\r\n');
    expect(plain[0]).not.toContain('Final score');
    const lines = buildQuizResultsCsv(rows, questions, {
      finalScore: (r) => (r.pin === '1111' ? '90%' : 'Excused'),
    }).split('\r\n');
    expect(lines[0].endsWith('Final score')).toBe(true);
    expect(lines[1].endsWith('90%')).toBe(true);
    expect(lines[2].endsWith('Excused')).toBe(true);
  });

  it('keeps each final score with its student after name sorting', () => {
    const lines = buildQuizResultsCsv(
      [response('1111', 'Rome'), response('2222', 'Paris')],
      questions,
      {
        pinToName: { '1111': 'Zed Young', '2222': 'Ada Lovelace' },
        finalScore: (r) => (r.pin === '1111' ? '90%' : 'Excused'),
      }
    ).split('\r\n');
    expect(lines[1]).toContain('Ada Lovelace');
    expect(lines[1].endsWith('Excused')).toBe(true);
    expect(lines[2]).toContain('Zed Young');
    expect(lines[2].endsWith('90%')).toBe(true);
  });
});
