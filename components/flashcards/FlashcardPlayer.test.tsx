import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlashcardCard, FlashcardSet } from '@/types';
import { LocalFlashcardAdapter, MemoryFlashcardAdapter } from './adapters';
import { FlashcardPlayer } from './FlashcardPlayer';
import { FlashcardShareModal } from './FlashcardShareModal';
import { TestMode } from './TestMode';

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
      name: 'Term: uno. Showing prompt. Flip to answer.',
    });
    await user.click(card);
    expect(
      screen.getByRole('button', {
        name: 'Definition: one. Showing answer. Flip to prompt.',
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
    expect(screen.getByText('1. Multiple choice')).toBeTruthy();
  });

  it('keeps keyboard shortcuts working after clicking a card control', async () => {
    const user = userEvent.setup();
    const adapter = new LocalFlashcardAdapter('player-keys');
    render(
      <FlashcardPlayer
        cards={cards}
        termLanguage="es-US"
        definitionLanguage="en-US"
        adapter={adapter}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Got it' }));
    await user.keyboard('{ArrowUp}');
    expect(screen.getByText('3/4')).toBeTruthy();
    expect(adapter.load().cards['two']?.s).toBe(1);
  });

  it('hides mastery progress in Present', () => {
    render(
      <FlashcardPlayer
        cards={cards}
        termLanguage="es-US"
        definitionLanguage="en-US"
        adapter={new MemoryFlashcardAdapter()}
        allowedModes={['flashcards']}
        theme="present"
      />
    );
    expect(screen.queryByText('Round 1')).toBeNull();
    expect(screen.queryByText('0/4 mastered')).toBeNull();
  });

  it('shows the exact spelling before moving on from an accepted answer', async () => {
    const user = userEvent.setup();
    const adapter = new LocalFlashcardAdapter('player-accepted');
    render(
      <FlashcardPlayer
        cards={[{ id: 'eleve', term: 'student', definition: 'élève' }]}
        termLanguage="en-US"
        definitionLanguage="fr-FR"
        adapter={adapter}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Write' }));
    const answer = screen.getByPlaceholderText('Type your answer');
    await user.type(answer, 'eleve');
    const form = answer.closest('form');
    if (form) fireEvent.submit(form);
    expect(screen.getByText('Accepted')).toBeTruthy();
    expect(adapter.load().cards['eleve']).toBeUndefined();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(adapter.load().cards['eleve']?.s).toBe(1);
  });

  it('inserts a capital from the character bar when Shift is held', async () => {
    const user = userEvent.setup();
    render(
      <FlashcardPlayer
        cards={[{ id: 'eleve', term: 'student', definition: 'élève' }]}
        termLanguage="en-US"
        definitionLanguage="fr-FR"
        adapter={new LocalFlashcardAdapter('player-shift')}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Write' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert é' }), {
      shiftKey: true,
    });
    expect(screen.getByPlaceholderText('Type your answer')).toHaveProperty(
      'value',
      'É'
    );
  });
});

describe('TestMode', () => {
  it('grades multiple choice exactly, not with typo tolerance', async () => {
    const user = userEvent.setup();
    const onRecordBatch = vi.fn();
    const deck: FlashcardCard[] = [
      { id: 'house', term: 'house', definition: 'casa' },
      { id: 'thing', term: 'thing', definition: 'cosa' },
      { id: 'dog', term: 'dog', definition: 'perro' },
      { id: 'cat', term: 'cat', definition: 'gato' },
    ];
    render(
      <TestMode
        cards={deck}
        round={1}
        showFirst="term"
        termLanguage="en-US"
        definitionLanguage="es-US"
        strict={false}
        testTypes={['mc']}
        testCount="all"
        dark={false}
        onRecordBatch={onRecordBatch}
      />
    );

    for (const card of deck) {
      const section = screen
        .getByRole('heading', { name: card.term })
        .closest('section');
      if (!section) throw new Error('missing question');
      const pick = card.id === 'house' ? 'cosa' : card.definition;
      const option = Array.from(section.querySelectorAll('button')).find(
        (button) => button.textContent === pick
      );
      if (!option) throw new Error('missing option');
      await user.click(option);
    }
    await user.click(screen.getByRole('button', { name: 'Submit test' }));

    expect(screen.getByText('3/4')).toBeTruthy();
    expect(onRecordBatch).toHaveBeenCalledWith(
      expect.arrayContaining([{ cardId: 'house', correct: false }])
    );
  });
});

describe('FlashcardShareModal', () => {
  it('mints a new link after the current one is turned off', async () => {
    const user = userEvent.setup();
    const set: FlashcardSet = {
      id: 'set-1',
      title: 'Spanish',
      termLanguage: 'es-US',
      definitionLanguage: 'en-US',
      cards,
      publicShareId: 'old-share',
      createdAt: 1,
      updatedAt: 1,
    };
    const onPublish = vi.fn(() => Promise.resolve('new-share'));
    render(
      <FlashcardShareModal
        isOpen
        set={set}
        onClose={vi.fn()}
        onPublish={onPublish}
        onRevoke={() => Promise.resolve()}
        onNotice={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Turn off' }));
    await user.click(
      await screen.findByRole('button', { name: 'Create public link' })
    );
    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ publicShareId: null })
    );
  });
});
