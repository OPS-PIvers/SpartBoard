import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { OrderingListInput } from '@/components/quiz/OrderingListInput';
import {
  orderFromSaved,
  startingOrder,
} from '@/components/quiz/orderingListOrder';
import type { QuizPublicQuestion } from '@/types';

const question: QuizPublicQuestion = {
  id: 'qo',
  type: 'Ordering',
  text: 'Put these in order',
  timeLimit: 0,
  orderingItems: ['First', 'Second', 'Third'],
};

describe('OrderingListInput', () => {
  it('shows every item once, in the starting order', () => {
    render(
      <OrderingListInput
        question={question}
        initialOrder={[2, 0, 1]}
        onChange={vi.fn()}
      />
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Third'),
      expect.stringContaining('First'),
      expect.stringContaining('Second'),
    ]);
    expect(screen.queryByText('Word Bank')).not.toBeInTheDocument();
  });

  it('moves an item with the arrows and emits the full order', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <OrderingListInput
        question={question}
        initialOrder={[2, 0, 1]}
        onChange={onChange}
      />
    );
    await user.click(
      screen.getByRole('button', { name: 'Move position 2 up' })
    );
    expect(onChange).toHaveBeenLastCalledWith('First|Third|Second');
  });

  it('turns the arrows off when disabled', () => {
    render(
      <OrderingListInput
        question={question}
        initialOrder={[0, 1, 2]}
        onChange={vi.fn()}
        disabled
      />
    );
    expect(
      screen.getByRole('button', { name: 'Move position 2 up' })
    ).toBeDisabled();
  });
});

describe('orderFromSaved / startingOrder', () => {
  const items = ['A', 'B', 'A'];

  it('maps a full saved order to indices, duplicates included', () => {
    expect(orderFromSaved(items, 'A|A|B')).toEqual([0, 2, 1]);
  });

  it('rejects partial or foreign answers', () => {
    expect(orderFromSaved(items, 'A||B')).toBeNull();
    expect(orderFromSaved(items, 'A|B')).toBeNull();
    expect(orderFromSaved(items, 'A|B|C')).toBeNull();
    expect(orderFromSaved(items, null)).toBeNull();
  });

  it('starts from the saved order, else a shuffle of every item', () => {
    expect(startingOrder(items, 'B|A|A')).toEqual([1, 0, 2]);
    expect([...startingOrder(items, null)].sort()).toEqual([0, 1, 2]);
  });
});
