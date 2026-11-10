import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { FlashcardCard } from '@/types';
import { TestMode } from './TestMode';

const deck = (fixed?: string): FlashcardCard[] =>
  Array.from({ length: 6 }, (_, index) => ({
    id: `c${index}`,
    term: `term ${index}`,
    definition: index === 0 && fixed ? fixed : `def ${index}`,
  }));

const view = (cards: FlashcardCard[]) => (
  <TestMode
    cards={cards}
    round={1}
    showFirst="term"
    termLanguage="es-US"
    definitionLanguage="en-US"
    strict={false}
    testTypes={['mc', 'fib']}
    testCount="all"
    dark={false}
    onRecordBatch={vi.fn()}
  />
);

const headings = () =>
  screen.getAllByRole('heading').map((heading) => heading.textContent);

describe('TestMode live card fixes', () => {
  beforeAll(() => {
    Element.prototype.scrollTo = vi.fn();
  });

  it('keeps question order and types when a card’s text is fixed', () => {
    const { container, rerender } = render(view(deck()));
    const before = headings();
    const types = () =>
      [...container.querySelectorAll('[data-test-index]')].map(
        (section) => section.querySelector('input') !== null
      );
    const typesBefore = types();
    rerender(view(deck('def zero')));
    expect(headings()).toEqual(before);
    expect(types()).toEqual(typesBefore);
  });

  it('counts a choice the fix removed as unanswered', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(view(deck()));
    const section = [
      ...container.querySelectorAll<HTMLElement>('[data-test-index]'),
    ].find((el) => within(el).queryByRole('button', { name: 'def 0' }));
    expect(section).toBeTruthy();
    const index = Number(section?.getAttribute('data-test-index')) + 1;
    const dot = () =>
      screen.getByRole('button', { name: `Go to question ${index}` });
    await user.click(
      within(section as HTMLElement).getByRole('button', { name: 'def 0' })
    );
    expect(dot().className).toContain('bg-rose-600');
    rerender(view(deck('def zero')));
    expect(dot().className).not.toContain('bg-rose-600');
  });
});
