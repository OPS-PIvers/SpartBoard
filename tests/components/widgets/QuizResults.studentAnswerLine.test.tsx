import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StudentAnswerLine } from '@/components/widgets/QuizWidget/components/results/StudentAnswerLine';
import type { StudentQuestionLine } from '@/utils/quizStudentDrilldown';

const written: StudentQuestionLine = {
  questionId: 'w1',
  number: 2,
  text: 'Explain why.',
  type: 'free-response',
  mark: 'partial',
  pointsEarned: 3,
  pointsMax: 4,
  answerText: 'Because it is warm.',
  correctAnswerText: null,
  manual: true,
  writtenGrade: {
    pointsAwarded: 3,
    overallComment: '  Add one more reason.  ',
    rubricScores: [{ criterionId: 'c1', levelId: 'l3', points: 3 }],
  },
  rubric: {
    id: 'r1',
    title: 'Reasoning',
    criteria: [
      {
        id: 'c1',
        name: 'Evidence',
        levels: [{ id: 'l3', label: 'Proficient', points: 3 }],
      },
    ],
  },
} as unknown as StudentQuestionLine;

const renderLine = (line: StudentQuestionLine, onOpenGrader?: () => void) =>
  render(
    <ul>
      <StudentAnswerLine line={line} onOpenGrader={onOpenGrader} />
    </ul>
  );

describe('StudentAnswerLine', () => {
  it('shows the answer, points, comment and rubric levels', () => {
    renderLine(written);
    expect(screen.getByText('Because it is warm.')).toBeInTheDocument();
    expect(screen.getByText('3/4')).toBeInTheDocument();
    expect(screen.getByText('Add one more reason.')).toBeInTheDocument();
    expect(screen.getByText('Evidence')).toBeInTheDocument();
    expect(screen.getByText('Proficient · 3 pts')).toBeInTheDocument();
    expect(screen.queryByText('Correct answer')).toBeNull();
  });

  it('shows the key only on a missed auto-graded question', () => {
    const missed = {
      ...written,
      type: 'MC',
      manual: false,
      mark: 'incorrect',
      answerText: 'Rome',
      correctAnswerText: 'Paris',
      writtenGrade: undefined,
      rubric: undefined,
    } as StudentQuestionLine;
    const { unmount } = renderLine(missed);
    expect(screen.getByText('Paris')).toBeInTheDocument();
    unmount();
    renderLine({ ...missed, mark: 'correct', answerText: 'Paris' });
    expect(screen.queryByText('Correct answer')).toBeNull();
  });

  it('offers a Grade button only when a grader handler is given', () => {
    const onOpen = vi.fn();
    renderLine(written, onOpen);
    fireEvent.click(screen.getByRole('button', { name: /Grade Q2/ }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('labels a missing answer', () => {
    renderLine({ ...written, answerText: '', mark: 'noAnswer' });
    // Once as the mark, once in the answer field.
    expect(screen.getAllByText('No answer')).toHaveLength(2);
  });
});
