import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(() => () => undefined),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));
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

const REF = {
  dialect: 'es-419' as const,
  tokens: ['p', 'e', 'ɾ', 'o'],
  stress: [0],
  source: 'voice' as const,
};

describe('FlashcardsSpeakWordsToCheck fixes', () => {
  it('reads a sounds-like spelling and saves it as an accepted reading', async () => {
    const saveFix = vi.fn(() => Promise.resolve());
    const readSpelling = vi.fn(() => Promise.resolve([REF]));
    render(
      <FlashcardsSpeakWordsToCheck
        load={() => Promise.resolve(RESULT)}
        fixesOverride={{}}
        saveFix={saveFix}
        readSpelling={readSpelling}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: /^fix$/i }));
    fireEvent.change(screen.getByLabelText(/type how it sounds/i), {
      target: { value: 'pero' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(await screen.findByText('Sounds like “pero”')).toBeInTheDocument();
    expect(readSpelling).toHaveBeenCalledWith('es', 'pero');
    fireEvent.click(screen.getByRole('button', { name: /save fix/i }));
    await waitFor(() => expect(saveFix).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(saveFix).toHaveBeenCalledWith(
      'es:perro',
      expect.objectContaining({
        language: 'es',
        term: 'perro',
        skip: false,
        accepted: [expect.objectContaining({ kind: 'spelling', refs: [REF] })],
      })
    );
  });

  it('says so when the spelling cannot be read', async () => {
    render(
      <FlashcardsSpeakWordsToCheck
        load={() => Promise.resolve(RESULT)}
        fixesOverride={{}}
        saveFix={vi.fn()}
        readSpelling={() => Promise.resolve(null)}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: /^fix$/i }));
    fireEvent.change(screen.getByLabelText(/type how it sounds/i), {
      target: { value: 'two words' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(
      await screen.findByText(/couldn't read that spelling/i)
    ).toBeInTheDocument();
  });

  it('removes the word from the fixes when nothing is left', async () => {
    const saveFix = vi.fn(() => Promise.resolve());
    render(
      <FlashcardsSpeakWordsToCheck
        load={() => Promise.resolve(RESULT)}
        fixesOverride={{
          'es:perro': {
            language: 'es',
            term: 'perro',
            skip: true,
            accepted: [],
            updatedAt: 1,
          },
        }}
        saveFix={saveFix}
        readSpelling={vi.fn()}
      />
    );
    expect(await screen.findByText('Skipped')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^fix$/i }));
    fireEvent.click(screen.getByLabelText(/skip this word/i));
    fireEvent.click(screen.getByRole('button', { name: /save fix/i }));
    await waitFor(() => expect(saveFix).toHaveBeenCalledWith('es:perro', null));
  });
});

describe('FlashcardsSpeakWordsToCheck', () => {
  it('lists pooled words with counts and opens a Speak-only practice', async () => {
    render(
      <FlashcardsSpeakWordsToCheck
        load={() => Promise.resolve(RESULT)}
        fixesOverride={{}}
      />
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
        fixesOverride={{}}
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
    render(<FlashcardsSpeakWordsToCheck load={load} fixesOverride={{}} />);
    expect(
      await screen.findByText(/couldn't load the words/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('perro')).toBeInTheDocument();
  });
});
