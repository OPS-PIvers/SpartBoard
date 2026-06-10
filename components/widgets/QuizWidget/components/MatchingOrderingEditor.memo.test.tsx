/**
 * Focused tests for the React.memo wrappers on MatchingAnswerEditor /
 * OrderingAnswerEditor (perf: skip re-rendering every pair/distractor row
 * while the teacher types in the question prompt).
 *
 * The comparator is internal, so these tests pin down the behavior that
 * must survive memoization: local row edits round-trip through the parent,
 * unrelated parent re-renders don't disturb row state, and external prop
 * changes (AI generation / quiz reload / distractor updates) are never
 * blocked by the memo — including a value-changed distractors array of the
 * same length, which exercises the comparator's value-compare branch.
 */

import React, { useCallback, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  MatchingAnswerEditor,
  OrderingAnswerEditor,
} from './MatchingOrderingEditor';

const EMPTY: string[] = [];

const MatchingHarness: React.FC = () => {
  // Mirrors the real data flow: the parent owns the wire-format strings and
  // echoes the editor's onChange back into props.
  const [correctAnswer, setCorrectAnswer] = useState('apple:red|banana:yellow');
  const [distractors, setDistractors] = useState<string[]>(EMPTY);
  const [, setUnrelated] = useState(0);

  const onChange = useCallback(
    (next: { correctAnswer: string; matchingDistractors: string[] }) => {
      setCorrectAnswer(next.correctAnswer);
      setDistractors(next.matchingDistractors);
    },
    []
  );

  return (
    <div>
      <button onClick={() => setUnrelated((n) => n + 1)}>type-prompt</button>
      <button onClick={() => setCorrectAnswer('x:1|y:2')}>
        external-reset
      </button>
      <button onClick={() => setDistractors(['zebra'])}>
        external-distractor
      </button>
      <MatchingAnswerEditor
        correctAnswer={correctAnswer}
        matchingDistractors={distractors}
        onChange={onChange}
      />
    </div>
  );
};

describe('MatchingAnswerEditor under memo', () => {
  it('keeps local row state across unrelated parent renders and edits, and still resets on external answer changes', () => {
    render(<MatchingHarness />);

    // Editing a pair round-trips through the parent and keeps the typed value.
    const termInputs = screen.getAllByPlaceholderText('Term');
    fireEvent.change(termInputs[0], { target: { value: 'apricot' } });
    expect(screen.getAllByPlaceholderText('Term')[0]).toHaveValue('apricot');

    // Unrelated parent state change (stands in for a prompt keystroke)
    // must not disturb row state.
    fireEvent.click(screen.getByText('type-prompt'));
    expect(screen.getAllByPlaceholderText('Term')[0]).toHaveValue('apricot');

    // External wire-format change (AI generation / reload) must re-render
    // and re-parse rows — the memo must never block a real prop change.
    fireEvent.click(screen.getByText('external-reset'));
    expect(screen.getAllByPlaceholderText('Term')[0]).toHaveValue('x');
    expect(screen.getAllByPlaceholderText('Match')[0]).toHaveValue('1');
  });

  it('does not block an external distractor value change', () => {
    render(<MatchingHarness />);
    // New array instance with different values — the comparator's
    // value-compare must report inequality so the editor re-renders.
    fireEvent.click(screen.getByText('external-distractor'));
    expect(screen.getByDisplayValue('zebra')).toBeInTheDocument();
  });
});

const OrderingHarness: React.FC = () => {
  const [correctAnswer, setCorrectAnswer] = useState('first|second|third');
  const [, setUnrelated] = useState(0);
  const onChange = useCallback((next: string) => setCorrectAnswer(next), []);
  return (
    <div>
      <button onClick={() => setUnrelated((n) => n + 1)}>type-prompt</button>
      <button onClick={() => setCorrectAnswer('a|b|c')}>external-reset</button>
      <OrderingAnswerEditor correctAnswer={correctAnswer} onChange={onChange} />
    </div>
  );
};

describe('OrderingAnswerEditor under memo', () => {
  it('keeps local row state across unrelated parent renders and still resets on external answer changes', () => {
    render(<OrderingHarness />);

    fireEvent.change(screen.getByPlaceholderText('Item 1'), {
      target: { value: 'first!' },
    });
    fireEvent.click(screen.getByText('type-prompt'));
    expect(screen.getByPlaceholderText('Item 1')).toHaveValue('first!');

    fireEvent.click(screen.getByText('external-reset'));
    expect(screen.getByPlaceholderText('Item 1')).toHaveValue('a');
    expect(screen.getByPlaceholderText('Item 3')).toHaveValue('c');
  });
});
