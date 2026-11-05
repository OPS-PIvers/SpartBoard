import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { FlashcardCard } from '@/types';
import { TestMode } from './TestMode';

const cards: FlashcardCard[] = Array.from({ length: 6 }, (_, index) => ({
  id: `c${index}`,
  term: `term ${index}`,
  definition: `def ${index}`,
}));

const renderTest = (questionBar: boolean) =>
  render(
    <TestMode
      cards={cards}
      round={1}
      showFirst="term"
      termLanguage="es-US"
      definitionLanguage="en-US"
      strict={false}
      testTypes={['mc']}
      testCount="all"
      dark={false}
      questionBar={questionBar}
      onRecordBatch={vi.fn()}
    />
  );

const pick = async (
  user: ReturnType<typeof userEvent.setup>,
  section: HTMLElement
) => {
  const term = within(section).getByRole('heading').textContent ?? '';
  await user.click(
    within(section).getByRole('button', {
      name: term.replace('term', 'def'),
    })
  );
};

describe('TestMode question bar', () => {
  beforeAll(() => {
    Element.prototype.scrollTo = vi.fn();
  });

  it('keeps the number strip by default', () => {
    renderTest(false);
    expect(
      screen.getByRole('button', { name: 'Go to question 6' })
    ).toBeTruthy();
    expect(screen.queryByText('Question 1 of 6')).toBeNull();
  });

  it('shows one question at a time and jumps to the next unanswered', async () => {
    const user = userEvent.setup();
    const { container } = renderTest(true);
    const shown = () =>
      container.querySelector<HTMLElement>('[data-test-index]') as HTMLElement;
    expect(container.querySelectorAll('[data-test-index]')).toHaveLength(1);
    expect(screen.getByText('Question 1 of 6')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Go to question 6' })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit test' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Question 2 of 6')).toBeTruthy();
    expect(shown().getAttribute('data-test-index')).toBe('1');
    await pick(user, shown());
    expect(screen.getByText('1 of 6 answered')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      '1'
    );

    await user.click(screen.getByRole('button', { name: 'Previous question' }));
    expect(screen.getByText('Question 1 of 6')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'All questions' }));
    const grid = screen.getByRole('dialog', { name: 'All questions' });
    expect(
      within(grid)
        .getByRole('button', { name: 'Go to question 1' })
        .getAttribute('aria-current')
    ).toBe('step');
    await user.click(
      within(grid).getByRole('button', { name: 'Go to question 2' })
    );
    expect(screen.getByText('Question 2 of 6')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'All questions' }));
    await user.click(screen.getByRole('button', { name: 'Next unanswered' }));
    expect(screen.getByText('Question 3 of 6')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'All questions' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers Submit once every question is answered', async () => {
    const user = userEvent.setup();
    const { container } = renderTest(true);
    for (let index = 0; index < 6; index += 1) {
      await pick(
        user,
        container.querySelector<HTMLElement>('[data-test-index]') as HTMLElement
      );
      if (index < 5)
        await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Submit test' })
        .hasAttribute('disabled')
    ).toBe(false);
  });
});
