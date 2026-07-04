/**
 * Regression test for the duplicate-left-term data-corruption bug flagged
 * in docs/routines/debugger.md (backlog: `MatchingOrderingEditor.tsx`
 * `serializePairs`, spotted on PR #2111 review but never fixed).
 *
 * A teacher who types the same Term into two rows produces
 * `correctAnswer = "term:a|term:b"`. Downstream:
 *  - `gradeAnswer` (hooks/useQuizSession.ts) builds a left→right `Map`
 *    keyed by term, so the second row silently overwrites the first —
 *    only one of the two rows the teacher created is ever graded.
 *  - The student-facing matching UI keys its drop zones by term text too,
 *    so the student can't even place two separate answers for it.
 *
 * Root-cause fix: surface the collision at the point of entry (the editor)
 * so a teacher can never save an unscoreable duplicate-term pair without
 * seeing a clear warning. This test asserts the editor detects duplicates
 * (case/whitespace-insensitive) and flags them — it fails on the
 * pre-fix editor, which has no duplicate-term detection at all.
 */

import React, { useCallback, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MatchingAnswerEditor } from './MatchingOrderingEditor';

const EMPTY: string[] = [];

const MatchingHarness: React.FC<{ initial: string }> = ({ initial }) => {
  const [correctAnswer, setCorrectAnswer] = useState(initial);
  const [distractors, setDistractors] = useState<string[]>(EMPTY);
  const onChange = useCallback(
    (next: { correctAnswer: string; matchingDistractors: string[] }) => {
      setCorrectAnswer(next.correctAnswer);
      setDistractors(next.matchingDistractors);
    },
    []
  );
  return (
    <MatchingAnswerEditor
      correctAnswer={correctAnswer}
      matchingDistractors={distractors}
      onChange={onChange}
    />
  );
};

describe('MatchingAnswerEditor duplicate-term guard', () => {
  it('does not warn when every term is unique', () => {
    render(<MatchingHarness initial="cat:animal|dog:animal" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const termInputs = screen.getAllByPlaceholderText('Term');
    termInputs.forEach((input) =>
      expect(input).toHaveAttribute('aria-invalid', 'false')
    );
  });

  it('flags rows with a duplicate term (same wire format teachers can create today)', () => {
    // This is exactly the corrupted state described in the backlog: two
    // rows, same term, different definitions.
    render(<MatchingHarness initial="cat:animal|cat:feline" />);

    // A visible warning must appear so the teacher knows the second row
    // will not be independently graded / placeable by the student.
    expect(screen.getByRole('alert')).toHaveTextContent(/duplicate/i);

    // Both offending rows should be marked invalid, not just flagged in
    // aggregate.
    const termInputs = screen.getAllByPlaceholderText('Term');
    expect(termInputs).toHaveLength(2);
    termInputs.forEach((input) =>
      expect(input).toHaveAttribute('aria-invalid', 'true')
    );
  });

  it('is case- and whitespace-insensitive, and clears once the teacher fixes it', () => {
    render(<MatchingHarness initial="Cat: animal| cat :feline" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Teacher edits the second row's term to be unique — warning should
    // clear immediately (this exercises the live re-render path, not just
    // initial parse).
    const termInputs = screen.getAllByPlaceholderText('Term');
    fireEvent.change(termInputs[1], { target: { value: 'dog' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('flags a duplicate introduced by editing an existing unique row to match another', () => {
    render(<MatchingHarness initial="cat:animal|dog:animal" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const termInputs = screen.getAllByPlaceholderText('Term');
    fireEvent.change(termInputs[1], { target: { value: 'cat' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
