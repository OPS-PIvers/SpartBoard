import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FlashcardCard } from '@/types';
import { LocalFlashcardAdapter } from './adapters';
import { FlashcardPlayer } from './FlashcardPlayer';

const cards: FlashcardCard[] = [
  { id: 'one', term: 'uno', definition: 'one' },
  { id: 'two', term: 'dos', definition: 'two' },
  { id: 'three', term: 'tres', definition: 'three' },
  { id: 'four', term: 'cuatro', definition: 'four' },
];

describe('FlashcardPlayer', () => {
  beforeEach(() => localStorage.clear());

  it('flips, records, and advances a flashcard', async () => {
    const user = userEvent.setup();
    render(
      <FlashcardPlayer
        cards={cards}
        termLanguage="es-US"
        definitionLanguage="en-US"
        adapter={new LocalFlashcardAdapter('player-flip')}
      />
    );

    const card = screen.getByRole('button', {
      name: 'Showing prompt. Flip to answer.',
    });
    await user.click(card);
    expect(
      screen.getByRole('button', {
        name: 'Showing answer. Flip to prompt.',
      })
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.getByText('2/4')).toBeTruthy();
  });

  it('uses the shared mode picker for Write and Test', async () => {
    const user = userEvent.setup();
    const adapter = new LocalFlashcardAdapter('player-modes');
    render(
      <FlashcardPlayer
        cards={cards}
        termLanguage="es-US"
        definitionLanguage="en-US"
        adapter={adapter}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Write' }));
    const answer = screen.getByPlaceholderText('Type your answer');
    await user.type(answer, 'one');
    const form = answer.closest('form');
    expect(form).not.toBeNull();
    if (form) fireEvent.submit(form);
    expect(adapter.load().cards['one']?.s).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Test' }));
    expect(
      screen.getByRole('navigation', { name: 'Test questions' })
    ).toBeTruthy();
    expect(screen.getByText('1. Fill in the blank')).toBeTruthy();
  });
});
