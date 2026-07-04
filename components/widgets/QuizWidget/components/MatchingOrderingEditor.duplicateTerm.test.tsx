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

  it('collapses internal whitespace the same way the grading engine does', () => {
    // hooks/useQuizSession.ts normalizeAnswer collapses internal whitespace
    // (`.replace(/\s+/g, ' ')`) before building the grading map, so "cat  dog"
    // and "cat dog" grade as the same duplicate term. The editor's detection
    // must use the same normalization or it would miss a duplicate the
    // grader silently collapses.
    render(<MatchingHarness initial="cat  dog:animal|cat dog:mammal" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    const termInputs = screen.getAllByPlaceholderText('Term');
    termInputs.forEach((input) =>
      expect(input).toHaveAttribute('aria-invalid', 'true')
    );
  });

  it('flags a duplicate introduced by editing an existing unique row to match another', () => {
    render(<MatchingHarness initial="cat:animal|dog:animal" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const termInputs = screen.getAllByPlaceholderText('Term');
    fireEvent.change(termInputs[1], { target: { value: 'cat' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('flags blank-term rows that carry definitions (they collide on the grader’s "" key)', () => {
    // ":animal|:feline" — two rows with empty terms and distinct definitions.
    // serializePairs still emits `:animal|:feline`, and the grader's Map keys
    // on the (empty) term text, so the second row silently overwrites the
    // first. Detection must flag this the same as any other duplicate term.
    render(<MatchingHarness initial=":animal|:feline" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/duplicate/i);
    const termInputs = screen.getAllByPlaceholderText('Term');
    termInputs.forEach((input) =>
      expect(input).toHaveAttribute('aria-invalid', 'true')
    );
  });

  it('does not warn on default fully-empty placeholder rows', () => {
    // A fresh editor starts with two empty rows (no term, no definition).
    // Those are dropped by serializePairs and never reach the grader, so they
    // must not be treated as blank-term duplicates.
    render(<MatchingHarness initial="" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const termInputs = screen.getAllByPlaceholderText('Term');
    termInputs.forEach((input) =>
      expect(input).toHaveAttribute('aria-invalid', 'false')
    );
  });
});
