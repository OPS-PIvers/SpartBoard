/** Choose-N sections in scoring and results (docs/plans/QUIZ_EXAMVIEW_IMPORT.md E14). */
import { describe, it, expect } from 'vitest';
import type { QuizQuestion, QuizResponse, QuizSessionSection } from '@/types';
import {
  isCountedFor,
  notChosenQuestionIds,
  sectionAwareMaxPoints,
  withNotChosen,
} from '@/utils/quizSections';
import { quizMaxPoints } from '@/utils/quizMaxPoints';
import { getResponseScore } from '@/components/widgets/QuizWidget/utils/quizScoreboard';
import { computeStudentDrilldown } from '@/utils/quizStudentDrilldown';
import { computeQuestionDrilldowns } from '@/utils/quizQuestionDrilldown';

const mc = (id: string): QuizQuestion => ({
  id,
  text: id,
  type: 'MC',
  correctAnswer: 'right',
  incorrectAnswers: ['wrong'],
  timeLimit: 0,
});

const written = (id: string, points: number): QuizQuestion => ({
  id,
  text: id,
  type: 'free-response',
  correctAnswer: '',
  incorrectAnswers: [],
  timeLimit: 0,
  points,
});

const questions = [
  mc('q1'),
  written('q2', 3),
  written('q3', 3),
  written('q4', 3),
];
const pickTwo: QuizSessionSection = {
  id: 's',
  title: 'Short Answer',
  chooseCount: 2,
  questionIds: ['q2', 'q3', 'q4'],
};

const response = (
  answers: [string, string][],
  grading: QuizResponse['grading'] = {}
): QuizResponse => ({
  studentUid: 'u1',
  joinedAt: 0,
  status: 'completed',
  answers: answers.map(([questionId, answer]) => ({
    questionId,
    answer,
    answeredAt: 1,
  })),
  score: null,
  submittedAt: 1,
  grading,
});

const grade = (points: number) => ({
  pointsAwarded: points,
  gradedAt: 1,
  gradedBy: 't',
});

describe('not chosen', () => {
  it('lists the questions a student left out', () => {
    const r = response([
      ['q2', 'a'],
      ['q4', 'b'],
    ]);
    expect(notChosenQuestionIds(r, [pickTwo])).toEqual(['q3']);
    const [stamped] = withNotChosen([r], [pickTwo]);
    expect(stamped._notChosen).toEqual(['q3']);
    expect(isCountedFor(stamped, 'q3')).toBe(false);
    expect(isCountedFor(stamped, 'q2')).toBe(true);
  });

  it('leaves responses alone when no section has a count', () => {
    const r = response([]);
    expect(
      withNotChosen([r], [{ ...pickTwo, chooseCount: undefined }])
    ).toEqual([r]);
  });
});

describe('max points (E14)', () => {
  it('adds only the N highest values of a choose-N section', () => {
    expect(sectionAwareMaxPoints(questions, [pickTwo])).toBe(1 + 6);
    expect(quizMaxPoints(questions, [pickTwo])).toBe(7);
    expect(quizMaxPoints(questions)).toBe(10);
  });
});

describe('a student’s score', () => {
  it('is out of the chosen questions only', () => {
    const [r] = withNotChosen(
      [
        response(
          [
            ['q1', 'right'],
            ['q2', 'an answer'],
            ['q4', 'another'],
          ],
          { q2: grade(3), q4: grade(3) } as QuizResponse['grading']
        ),
      ],
      [pickTwo]
    );
    expect(getResponseScore(r, questions)).toBe(100);
  });

  it('shows the left-out question as not chosen, worth nothing', () => {
    const [r] = withNotChosen(
      [
        response([
          ['q2', 'a'],
          ['q3', 'b'],
        ]),
      ],
      [pickTwo]
    );
    const line = computeStudentDrilldown(questions, r).lines.find(
      (l) => l.questionId === 'q4'
    );
    expect(line).toMatchObject({ mark: 'notChosen', pointsMax: 0 });
  });

  it('keeps students who didn’t choose a question out of its denominator', () => {
    const responses = withNotChosen(
      [
        {
          ...response([
            ['q2', 'a'],
            ['q3', 'b'],
          ]),
          studentUid: 'u1',
        },
        {
          ...response([
            ['q2', 'a'],
            ['q4', 'b'],
          ]),
          studentUid: 'u2',
        },
      ],
      [pickTwo]
    );
    const drill = computeQuestionDrilldowns(
      questions,
      responses,
      () => 'x'
    ).get('q3');
    expect(drill?.outcomes.notChosen).toHaveLength(1);
    expect(drill?.servedCount).toBe(1);
  });
});
