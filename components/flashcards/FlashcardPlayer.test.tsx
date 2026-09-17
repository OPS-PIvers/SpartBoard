import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FlashcardCard,
  FlashcardModeSettings,
  FlashcardSet,
} from '@/types';
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

const lockedSettings = (
  overrides: Partial<FlashcardModeSettings> = {}
): FlashcardModeSettings => ({
  showFirst: 'term',
  shuffle: false,
  favoritesOnly: false,
  hideMastered: false,
  strict: false,
  testTypes: ['mc', 'fib'],
  testCount: 'all',
  ...overrides,
});

describe('FlashcardPlayer Check assignments', () => {
  beforeEach(() => localStorage.clear());

  const submitWrite = (value: string) => {
    const answer = screen.getByPlaceholderText('Type your answer');
    fireEvent.change(answer, { target: { value } });
    const form = answer.closest('form');
    if (!form) throw new Error('missing form');
    fireEvent.submit(form);
  };

  it('re-queues Write misses and submits first tries with flags', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCheckWrite = vi.fn();
    render(
      <FlashcardPlayer
        cards={cards.slice(0, 2)}
        termLanguage="es-US"
        definitionLanguage="en-US"
        adapter={new LocalFlashcardAdapter('check-write')}
        lockedSettings={lockedSettings({ strict: true })}
        check={{
          mode: 'write',
          submitting: false,
          onCheckWrite,
          onSubmit,
        }}
      />
    );

    expect(screen.queryByRole('button', { name: 'Test' })).toBeNull();
    submitWrite('won');
    await user.click(
      screen.getByRole('button', { name: 'I think this is right' })
    );
    expect(screen.getByText('Flagged for your teacher')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'I was right' })).toBeNull();
    const retype = screen.getByLabelText('Retype the correct answer');
    fireEvent.change(retype, { target: { value: 'one' } });
    const retypeForm = retype.closest('form');
    if (retypeForm) fireEvent.submit(retypeForm);

    submitWrite('two');
    expect(screen.getByText('Term · 3/3')).toBeTruthy();
    submitWrite('one');

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).toHaveBeenCalledWith({
      answerLog: [
        { cardId: 'one', response: 'won', attempts: 2 },
        { cardId: 'two', response: 'two', attempts: 1 },
      ],
      flags: [{ cardId: 'one', response: 'won' }],
    });
    expect(onCheckWrite).toHaveBeenLastCalledWith('one', {
      response: 'won',
      attempts: 2,
      done: true,
      flagged: true,
    });
  });

  it('resumes a Write check from the saved log', () => {
    render(
      <FlashcardPlayer
        cards={cards.slice(0, 2)}
        termLanguage="es-US"
        definitionLanguage="en-US"
        adapter={new LocalFlashcardAdapter('check-resume')}
        lockedSettings={lockedSettings()}
        check={{
          mode: 'write',
          submitting: false,
          initialCheckLog: {
            one: { response: 'one', attempts: 1, done: true },
          },
          onSubmit: vi.fn(),
        }}
      />
    );
    expect(screen.getByRole('heading', { name: 'dos' })).toBeTruthy();
    expect(screen.getByText('Term · 1/1')).toBeTruthy();
  });

  it('unlocks Flashcards submit once every card meets the threshold and locks settings', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const progress = Object.fromEntries(
      cards.map((card) => [card.id, { s: 2 as const, due: 3, c: 2, w: 0 }])
    );
    render(
      <FlashcardPlayer
        cards={cards}
        termLanguage="es-US"
        definitionLanguage="en-US"
        adapter={
          new LocalFlashcardAdapter('check-flashcards', {
            cards: progress,
            starred: [],
            round: 3,
          })
        }
        lockedSettings={lockedSettings()}
        check={{
          mode: 'flashcards',
          masteryThreshold: 2,
          submitting: false,
          onSubmit,
        }}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Study settings' }));
    expect(
      screen.getByText('Your teacher set these options for this check.')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Definition' })).toHaveProperty(
      'disabled',
      true
    );
    expect(screen.queryByRole('button', { name: 'Favorites only' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).toHaveBeenCalledWith({ answerLog: [], flags: [] });
  });

  it('sends Test answers to the server instead of reviewing them locally', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <FlashcardPlayer
        cards={cards}
        termLanguage="es-US"
        definitionLanguage="en-US"
        adapter={new LocalFlashcardAdapter('check-test')}
        lockedSettings={lockedSettings({ testTypes: ['mc'], testCount: 'all' })}
        check={{ mode: 'test', submitting: false, onSubmit }}
      />
    );

    for (const card of cards) {
      const section = screen
        .getByRole('heading', { name: card.term })
        .closest('section');
      const option = Array.from(section?.querySelectorAll('button') ?? []).find(
        (button) => button.textContent === card.definition
      );
      if (!option) throw new Error('missing option');
      await user.click(option);
    }
    await user.click(screen.getByRole('button', { name: 'Submit test' }));

    expect(screen.queryByText('Test complete')).toBeNull();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [{ answerLog }] = onSubmit.mock.calls[0] as [
      { answerLog: Array<{ cardId: string; type: string; response: string }> },
    ];
    expect(answerLog).toHaveLength(4);
    expect(answerLog).toEqual(
      expect.arrayContaining([{ cardId: 'one', type: 'mc', response: 'one' }])
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
