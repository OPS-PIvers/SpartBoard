/**
 * Phase 2 — student-facing review surface for written-response questions.
 *
 * `PublishedScoreReview` itself is private to QuizStudentApp.tsx (the
 * full screen wires Firestore listeners + auth + URL params); the
 * essential per-question rendering lives in `WrittenAnswerReview`,
 * which is exported for direct testing. The branch logic in
 * PublishedScoreReview ("written types → WrittenAnswerReview; auto-
 * graded types → plain text") is exercised at the parent level via
 * QuizStudentApp E2E.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WrittenAnswerReview } from '@/components/quiz/QuizStudentApp';
import type { WrittenAnswerGrade } from '@/types';

describe('WrittenAnswerReview', () => {
  it('renders nothing when showResponse is false', () => {
    const { container } = render(
      <WrittenAnswerReview
        studentAnswer="<p>hi</p>"
        grade={undefined}
        showResponse={false}
        maxPoints={5}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the sanitized live answer when no grade yet', () => {
    const { container } = render(
      <WrittenAnswerReview
        studentAnswer="<p>hello world</p>"
        grade={undefined}
        showResponse={true}
        maxPoints={5}
      />
    );
    expect(container.textContent).toContain('hello world');
    expect(screen.getByText(/Not yet graded/i)).toBeInTheDocument();
  });

  it('shows the snapshot (NOT the live answer) when a grade exists', () => {
    const grade: WrittenAnswerGrade = {
      pointsAwarded: 4,
      overallComment: 'Nice work',
      gradedBy: 't',
      gradedAt: 0,
      gradingSnapshot: '<p>FROZEN</p>',
    };
    const { container } = render(
      <WrittenAnswerReview
        studentAnswer="<p>student edited later</p>"
        grade={grade}
        showResponse={true}
        maxPoints={5}
      />
    );
    expect(container.textContent).toContain('FROZEN');
    expect(container.textContent).not.toContain('student edited later');
    expect(screen.getByText(/Nice work/)).toBeInTheDocument();
    expect(screen.getByText(/4 \/ 5/)).toBeInTheDocument();
  });

  it('renders highlight marks when annotations exist', () => {
    const grade: WrittenAnswerGrade = {
      pointsAwarded: 3,
      gradedBy: 't',
      gradedAt: 0,
      gradingSnapshot: '<p>alpha beta</p>',
      annotations: [
        {
          id: 'a1',
          from: 0,
          to: 5,
          highlightColor: 'green',
          authorUid: 't',
          createdAt: 0,
          comment: 'thesis',
        },
      ],
    };
    const { container } = render(
      <WrittenAnswerReview
        studentAnswer=""
        grade={grade}
        showResponse={true}
        maxPoints={5}
      />
    );
    const mark = container.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('alpha');
    expect(mark?.getAttribute('data-color')).toBe('green');
    expect(screen.getByText('thesis')).toBeInTheDocument();
  });

  it('shows "no response" when the student never answered AND no grade exists', () => {
    render(
      <WrittenAnswerReview
        studentAnswer=""
        grade={undefined}
        showResponse={true}
        maxPoints={5}
      />
    );
    expect(screen.getByText(/no response/i)).toBeInTheDocument();
  });
});
