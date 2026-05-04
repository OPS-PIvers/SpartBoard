/**
 * Standalone unit tests for OrderingResponseInput. Covers the tap-to-place
 * flow, hydration from saved answers, slot-to-slot moves via the up/down
 * arrows, and reset.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { OrderingResponseInput } from '@/components/quiz/OrderingResponseInput';
import type { QuizPublicQuestion } from '@/types';

function makeQuestion(orderingItems: string[]): QuizPublicQuestion {
  return {
    id: 'qo',
    type: 'Ordering',
    text: 'Put these in order',
    timeLimit: 0,
    orderingItems,
  };
}

describe('OrderingResponseInput', () => {
  it('renders all items as bank chips and empty slots', () => {
    const onChange = vi.fn();
    render(
      <OrderingResponseInput
        question={makeQuestion(['First', 'Second', 'Third'])}
        savedAnswer={null}
        onChange={onChange}
      />
    );
    // Three bank chips render as draggable buttons.
    expect(
      screen.getByRole('button', { name: /First, in word bank/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Second, in word bank/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Third, in word bank/ })
    ).toBeInTheDocument();
    // Three empty slot drop zones render with their position aria-labels.
    expect(
      screen.getByRole('button', { name: /Empty drop zone, position 1/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Empty drop zone, position 2/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Empty drop zone, position 3/ })
    ).toBeInTheDocument();
  });

  it('serializes pipe-joined items in slot order on tap-to-place', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <OrderingResponseInput
        question={makeQuestion(['A', 'B', 'C'])}
        savedAnswer={null}
        onChange={onChange}
      />
    );
    await user.click(screen.getByRole('button', { name: /A, in word bank/ }));
    await user.click(
      screen.getByRole('button', { name: /Empty drop zone, position 1/ })
    );
    expect(onChange).toHaveBeenLastCalledWith('A||');

    await user.click(screen.getByRole('button', { name: /B, in word bank/ }));
    await user.click(
      screen.getByRole('button', { name: /Empty drop zone, position 2/ })
    );
    expect(onChange).toHaveBeenLastCalledWith('A|B|');

    await user.click(screen.getByRole('button', { name: /C, in word bank/ }));
    await user.click(
      screen.getByRole('button', { name: /Empty drop zone, position 3/ })
    );
    expect(onChange).toHaveBeenLastCalledWith('A|B|C');
  });

  it('hydrates from a saved answer so placed chips render in their slots', () => {
    const onChange = vi.fn();
    render(
      <OrderingResponseInput
        question={makeQuestion(['A', 'B', 'C'])}
        savedAnswer="C|A|B"
        onChange={onChange}
      />
    );
    expect(
      screen.getByRole('button', { name: /C, position 1/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /A, position 2/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /B, position 3/ })
    ).toBeInTheDocument();
  });

  it('the up arrow swaps a slot with the one above and emits the new order', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <OrderingResponseInput
        question={makeQuestion(['A', 'B', 'C'])}
        savedAnswer="A|B|C"
        onChange={onChange}
      />
    );
    // Move position-2 (B) up → expected order A,C,B... no wait, A,B,C with
    // B moved up = B,A,C. Confirm:
    await user.click(
      screen.getByRole('button', { name: /Move position 2 up/ })
    );
    expect(onChange).toHaveBeenLastCalledWith('B|A|C');
  });

  it('reset returns every placed item to the bank and emits all-empty', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <OrderingResponseInput
        question={makeQuestion(['A', 'B', 'C'])}
        savedAnswer="A|B|C"
        onChange={onChange}
      />
    );
    await user.click(screen.getByRole('button', { name: /Reset/ }));
    expect(onChange).toHaveBeenLastCalledWith('||');
    // All three items are back in the bank.
    expect(
      screen.getByRole('button', { name: /A, in word bank/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /B, in word bank/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /C, in word bank/ })
    ).toBeInTheDocument();
  });
});
