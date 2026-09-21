import { describe, it, expect } from 'vitest';
import type { QuizQuestion, QuizResponse } from '@/types';
import { computeStudentDrilldown } from '@/utils/quizStudentDrilldown';
import { makeQuestionGradeFn } from '@/utils/quizQuestionStats';
import { buildStudentReportHtml } from '@/utils/quizStudentReportPrint';

const q = (
  id: string,
  type: QuizQuestion['type'],
  correctAnswer: string,
  extra: Partial<QuizQuestion> = {}
): QuizQuestion =>
  ({
    id,
    type,
    text: `Question ${id}`,
    correctAnswer,
    incorrectAnswers: [],
    timeLimit: 0,
    points: 1,
    ...extra,
  }) as unknown as QuizQuestion;

const response = (
  answers: Record<string, string>,
  extra: Partial<QuizResponse> = {}
): QuizResponse =>
  ({
    studentUid: 's1',
    _responseKey: 's1',
    status: 'completed',
    submittedAt: 1,
    tabSwitchWarnings: 0,
    answers: Object.entries(answers).map(([questionId, answer]) => ({
      questionId,
      answer,
      answeredAt: 1,
    })),
    ...extra,
  }) as unknown as QuizResponse;

describe('computeStudentDrilldown', () => {
  it('marks MC and FIB answers and shows the key under a wrong one', () => {
    const d = computeStudentDrilldown(
      [
        q('q1', 'MC', 'Paris', { incorrectAnswers: ['Rome'] }),
        q('q2', 'FIB', 'blue', { points: 2 }),
      ],
      response({ q1: 'Rome', q2: 'Blue' })
    );
    expect(d.lines.map((l) => [l.number, l.mark, l.answerText])).toEqual([
      [1, 'incorrect', 'Rome'],
      [2, 'correct', 'Blue'],
    ]);
    expect(d.lines[0].correctAnswerText).toBe('Paris');
    expect(d.lines[1].correctAnswerText).toBeNull();
    expect([d.pointsEarned, d.pointsMax, d.percent]).toEqual([2, 3, 67]);
  });

  it('grades a translated FIB answer through the bound grade function', () => {
    const fib = q('q1', 'FIB', 'dog');
    const r = response({ q1: 'perro' });
    expect(computeStudentDrilldown([fib], r).lines[0].mark).toBe('incorrect');
    const gradeFn = makeQuestionGradeFn({
      answers: { q1: { es: ['perro'] } },
      overridesByStudentUid: { s1: { language: 'es' } },
    } as never);
    expect(computeStudentDrilldown([fib], r, gradeFn).lines[0].mark).toBe(
      'correct'
    );
  });

  it('renders Matching and Ordering answers readably with partial credit', () => {
    const d = computeStudentDrilldown(
      [
        q('m', 'Matching', 'cat:meow|dog:woof', { allowPartialCredit: true }),
        q('o', 'Ordering', 'a|b|c'),
      ],
      response({ m: 'cat:meow|dog:meow', o: 'b|a|c' })
    );
    const [m, o] = d.lines;
    expect(m.mark).toBe('partial');
    expect(m.pointsEarned).toBeCloseTo(0.5);
    expect(m.answerText).toBe('cat → meow; dog → meow');
    expect(m.correctAnswerText).toBe('cat → meow; dog → woof');
    expect(o.mark).toBe('incorrect');
    expect(o.answerText).toBe('1. b; 2. a; 3. c');
    expect(o.correctAnswerText).toBe('1. a; 2. b; 3. c');
  });

  it('lists only the questions a bank quiz served, numbered by quiz order', () => {
    const d = computeStudentDrilldown(
      [q('q1', 'MC', 'a'), q('q2', 'MC', 'b'), q('q3', 'MC', 'c')],
      response({ q3: 'c' }, { servedQuestionIds: ['q3', 'q1'] })
    );
    expect(d.lines.map((l) => [l.questionId, l.number, l.mark])).toEqual([
      ['q1', 1, 'noAnswer'],
      ['q3', 3, 'correct'],
    ]);
    expect(d.pointsMax).toBe(2);
  });

  it('marks an ungraded written answer as provisional and a graded one by points', () => {
    const written = q('w', 'free-response', '', { points: 4 });
    const ungraded = computeStudentDrilldown(
      [written],
      response({ w: '<p>My <b>essay</b></p>' })
    );
    expect(ungraded.lines[0]).toMatchObject({
      mark: 'ungraded',
      manual: true,
      answerText: 'My essay',
      correctAnswerText: null,
    });
    expect(ungraded.provisional).toBe(true);

    const graded = computeStudentDrilldown(
      [written],
      response({ w: 'An answer' }, {
        grading: {
          w: { pointsAwarded: 3, gradedAt: 1, gradedBy: 't' },
        },
      } as Partial<QuizResponse>)
    );
    expect(graded.lines[0]).toMatchObject({
      mark: 'partial',
      pointsEarned: 3,
      pointsMax: 4,
      correctAnswerText: null,
    });
    expect(graded.provisional).toBe(false);
  });

  it('takes an excused recording out of the denominator', () => {
    const spoken = q('s', 'free-response', '', {
      points: 5,
      recording: { mode: 'audio' },
    } as unknown as Partial<QuizQuestion>);
    const d = computeStudentDrilldown(
      [spoken, q('q1', 'MC', 'a')],
      response({ q1: 'a' }, {
        grading: {
          s: { pointsAwarded: 0, excused: true, gradedAt: 1, gradedBy: 't' },
        },
      } as Partial<QuizResponse>)
    );
    expect(d.lines[0].mark).toBe('excused');
    expect(d.lines[0].pointsMax).toBe(0);
    expect(d.percent).toBe(100);
  });
});

describe('buildStudentReportHtml', () => {
  const drilldown = computeStudentDrilldown(
    [q('q1', 'MC', 'Paris', { text: 'Capital of <France>?' })],
    response({ q1: 'Rome' })
  );
  const job = {
    quizTitle: 'Capitals',
    studentName: 'Student 2',
    drilldown,
    targets: [{ label: 'T1 — Geography', percent: 0, band: 'beginning' }],
  };

  it('includes the correct answer, escaped text, score and targets', () => {
    const html = buildStudentReportHtml({
      ...job,
      includeCorrectAnswers: true,
    });
    expect(html).toContain('Capitals');
    expect(html).toContain('Student 2');
    expect(html).toContain('Score: 0% (0 of 1 points)');
    expect(html).toContain('Capital of &lt;France&gt;?');
    expect(html).toContain('Answer: Rome');
    expect(html).toContain('Correct answer: Paris');
    expect(html).toContain('T1 — Geography');
    expect(html).toContain('Beginning');
  });

  it('leaves the correct answers out when unchecked', () => {
    const html = buildStudentReportHtml({
      ...job,
      targets: [],
      includeCorrectAnswers: false,
    });
    expect(html).not.toContain('Correct answer');
    expect(html).not.toContain('Learning targets');
    expect(html).toContain('Answer: Rome');
  });
});
