import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('@/components/flashcards/FlashcardPlayer', () => ({
  FlashcardPlayer: (props: {
    cards: { term: string }[];
    allowedModes: string[];
    speak: { example: boolean };
  }) => (
    <div data-testid="player">
      {props.cards[0].term} {props.allowedModes.join(',')}{' '}
      {String(props.speak.example)}
    </div>
  ),
}));

import {
  FlashcardsSpeakWordsToCheck,
  type SpeakWordsToCheckResult,
} from './FlashcardsSpeakWordsToCheck';

const RESULT: SpeakWordsToCheckResult = {
  asOf: 1,
  assignments: 4,
  truncated: false,
  words: [
    {
      key: 'es:perro',
      language: 'es',
      term: 'perro',
      definition: 'dog',
      students: 12,
      missed: 9,
      assignments: 3,
      card: { id: 'c1', term: 'perro', definition: 'dog' },
      termLanguage: 'es-MX',
      definitionLanguage: 'en-US',
      settings: {
        dialects: ['es-419'],
        preset: 'beginner',
        strict: false,
        groups: {},
        attempts: 3,
        example: false,
      },
    },
  ],
};

describe('FlashcardsSpeakWordsToCheck', () => {
  it('lists pooled words with counts and opens a Speak-only practice', async () => {
    render(
      <FlashcardsSpeakWordsToCheck load={() => Promise.resolve(RESULT)} />
    );
    expect(await screen.findByText('perro')).toBeInTheDocument();
    expect(screen.getByText('9 of 12 missed')).toBeInTheDocument();
    expect(
      screen.getByText('dog · Spanish · 3 assignments')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /say it/i }));
    expect(await screen.findByTestId('player')).toHaveTextContent(
      'perro speak true'
    );
  });

  it('says so when no word meets the cut-off', async () => {
    render(
      <FlashcardsSpeakWordsToCheck
        load={() => Promise.resolve({ ...RESULT, words: [] })}
      />
    );
    expect(
      await screen.findByText('No words to check yet.')
    ).toBeInTheDocument();
  });

  it('shows an error and loads again on Refresh', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce(RESULT);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<FlashcardsSpeakWordsToCheck load={load} />);
    expect(
      await screen.findByText(/couldn't load the words/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('perro')).toBeInTheDocument();
  });
});
