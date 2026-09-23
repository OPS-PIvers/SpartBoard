import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GuidedLearningPublicStep, GuidedLearningStep } from '@/types';
import { QuestionInteraction } from './QuestionInteraction';

const PAIRS = [
  { left: 'Cat', right: 'Meow' },
  { left: 'Dog', right: 'Woof' },
  { left: 'Cow', right: 'Moo' },
];
const ORDER = ['First', 'Second', 'Third'];

// The teacher's Play hands the stage the author's step, key included.
const authored = (question: GuidedLearningStep['question']) =>
  ({
    id: 's1',
    xPct: 50,
    yPct: 50,
    imageIndex: 0,
    interactionType: 'question',
    question,
  }) as unknown as GuidedLearningPublicStep;

const sortingRows = () =>
  screen.getAllByText(/^(First|Second|Third)$/).map((n) => n.textContent);

describe('QuestionInteraction from the author’s copy', () => {
  it('fills both matching columns and grades against the pairs', () => {
    const onAnswer = vi.fn();
    render(
      <QuestionInteraction
        step={authored({
          type: 'matching',
          text: 'Match the sounds',
          matchingPairs: PAIRS,
        })}
        onAnswer={onAnswer}
        onContinue={() => undefined}
        correctMatchingPairs={PAIRS}
      />
    );
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(3);
    for (const p of PAIRS) {
      const row = screen.getByText(p.left).parentElement as HTMLElement;
      const select = within(row).getByRole('combobox');
      expect(within(select).getAllByRole('option')).toHaveLength(4);
      fireEvent.change(select, { target: { value: p.right } });
    }
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));
    expect(onAnswer).toHaveBeenCalledWith(expect.any(Array), true);
  });

  it('never opens a sorting question already solved', () => {
    for (let i = 0; i < 20; i++) {
      const { unmount } = render(
        <QuestionInteraction
          step={authored({
            type: 'sorting',
            text: 'Put them in order',
            sortingItems: ORDER,
          })}
          onAnswer={() => undefined}
          onContinue={() => undefined}
          correctSortingItems={ORDER}
        />
      );
      const rows = sortingRows();
      expect(rows).toHaveLength(3);
      expect(rows).not.toEqual(ORDER);
      unmount();
    }
  });

  it('keeps the student mirror’s matching columns as they came', () => {
    render(
      <QuestionInteraction
        step={{
          id: 's1',
          xPct: 50,
          yPct: 50,
          imageIndex: 0,
          interactionType: 'question',
          question: {
            type: 'matching',
            text: 'Match',
            matchingLeft: ['Dog', 'Cat'],
            matchingRight: ['Meow', 'Woof'],
          },
        }}
        onAnswer={() => undefined}
        onContinue={() => undefined}
        studentMode
      />
    );
    const lefts = screen
      .getAllByRole('combobox')
      .map((s) => s.parentElement?.querySelector('span')?.textContent);
    expect(lefts).toEqual(['Dog', 'Cat']);
    expect(
      within(screen.getAllByRole('combobox')[0])
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['-- select --', 'Meow', 'Woof']);
  });
});
