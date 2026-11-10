import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FlashcardCard, FlashcardStudyState } from '@/types';
import { recordFlashcardAnswer } from '@/utils/flashcardSchedule';
import { LocalFlashcardAdapter, MemoryFlashcardAdapter } from './adapters';
import { FlashcardPlayer } from './FlashcardPlayer';

const cards: FlashcardCard[] = [
  { id: 'one', term: 'uno', definition: 'one' },
  { id: 'two', term: 'dos', definition: 'two' },
  { id: 'three', term: 'tres', definition: 'three' },
  { id: 'four', term: 'cuatro', definition: 'four' },
];

const withMissed = (...ids: string[]): FlashcardStudyState => ({
  cards: Object.fromEntries(
    ids.map((id) => [id, recordFlashcardAnswer(undefined, 1, false)])
  ),
  starred: [],
  round: 1,
});

const promptFor = (term: string) =>
  screen.getByRole('button', {
    name: `Term: ${term}. Showing prompt. Flip to answer.`,
  });

describe('FlashcardPlayer missed cards', () => {
  beforeEach(() => localStorage.clear());

  it('offers the cards rated Still learning after a round, then back to all', async () => {
    const user = userEvent.setup();
    render(
      <FlashcardPlayer
        cards={cards}
        termLanguage="es-US"
        definitionLanguage="en-US"
        adapter={new LocalFlashcardAdapter('missed-flashcards')}
        missedCards
      />
    );
    expect(screen.queryByRole('button', { name: /Missed:/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Still learning' }));
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    await user.click(screen.getByRole('button', { name: 'Still learning' }));
    await user.click(screen.getByRole('button', { name: 'Got it' }));

    expect(screen.getByRole('button', { name: 'Missed: 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next round' })).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: 'Study 2 missed cards' })
    );

    expect(promptFor('uno')).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Missed: 2' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(promptFor('tres')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Still learning' }));

    expect(screen.queryByRole('button', { name: 'Next round' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restart all' })).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Study 1 missed card' })
    );
    expect(promptFor('tres')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Got it' }));

    expect(
      screen.queryByRole('button', { name: /Study .* missed/ })
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Study all cards' }));
    expect(screen.queryByRole('button', { name: /Missed:/ })).toBeNull();
    expect(screen.getByText(/Round \d/)).toBeTruthy();
  });

  it('studies missed cards from the header in Write and Test', async () => {
    const user = userEvent.setup();
    render(
      <FlashcardPlayer
        cards={cards}
        termLanguage="es-US"
        definitionLanguage="en-US"
        adapter={
          new LocalFlashcardAdapter('missed-header', withMissed('three'))
        }
        missedCards
      />
    );

    await user.click(screen.getByRole('button', { name: 'Write' }));
    await user.click(screen.getByRole('button', { name: 'Missed: 1' }));
    expect(screen.getByText('tres')).toBeTruthy();
    expect(screen.queryByText('uno')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Test' }));
    expect(screen.getByText(/^1\. /)).toBeTruthy();
    expect(screen.queryByText(/^2\. /)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Missed: 1' }));
    expect(screen.getByText(/^2\. /)).toBeTruthy();
  });

  it('records a wrong Write answer into the pile', async () => {
    const user = userEvent.setup();
    const adapter = new LocalFlashcardAdapter('missed-write');
    render(
      <FlashcardPlayer
        cards={cards.slice(0, 1)}
        termLanguage="es-US"
        definitionLanguage="en-US"
        adapter={adapter}
        missedCards
      />
    );
    await user.click(screen.getByRole('button', { name: 'Write' }));
    const answer = screen.getByPlaceholderText('Type your answer');
    await user.type(answer, 'zzzzzz');
    fireEvent.submit(answer.closest('form') as HTMLFormElement);
    const retype = screen.getByLabelText('Retype the correct answer');
    await user.type(retype, 'one');
    fireEvent.submit(retype.closest('form') as HTMLFormElement);
    expect(screen.getByRole('button', { name: 'Missed: 1' })).toBeTruthy();
  });

  it('never shows the pile without the stamp or in Present mode', () => {
    const { unmount } = render(
      <FlashcardPlayer
        cards={cards}
        termLanguage="es-US"
        definitionLanguage="en-US"
        adapter={new LocalFlashcardAdapter('missed-off', withMissed('one'))}
      />
    );
    expect(screen.queryByRole('button', { name: /Missed:/ })).toBeNull();
    unmount();
    render(
      <FlashcardPlayer
        cards={cards}
        termLanguage="es-US"
        definitionLanguage="en-US"
        adapter={new MemoryFlashcardAdapter()}
        missedCards
      />
    );
    expect(screen.queryByRole('button', { name: /Missed:/ })).toBeNull();
  });
});
