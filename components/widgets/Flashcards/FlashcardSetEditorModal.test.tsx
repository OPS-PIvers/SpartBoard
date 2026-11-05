import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SPEAK_G2P_VERSION } from '@/utils/pronunciation/g2pVersion';
import { AuthContext } from '@/context/AuthContextValue';
import type { AuthContextType } from '@/context/AuthContextValue';
import type { FlashcardCardSpeak, FlashcardSet } from '@/types';
import { defaultFlashcardsSpeakAdminConfig } from '@/config/flashcardsSpeakAdmin';
import { FlashcardSetEditorModal } from './FlashcardSetEditorModal';
import { flashcardSetIncompleteReason } from './useFlashcardEditorState';
import type { SpeakLookupCall } from './speak/lookupSpeakReferences';

const showConfirm = vi.hoisted(() =>
  vi.fn<(message: string) => Promise<boolean>>(() => Promise.resolve(true))
);
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm, showAlert: vi.fn() }),
}));

vi.mock('@/hooks/useFlashcardSets', () => ({
  readFlashcardsSpeakAdminConfig: vi.fn(() =>
    Promise.resolve(defaultFlashcardsSpeakAdminConfig())
  ),
}));

const ready = (term: string): FlashcardCardSpeak => ({
  term,
  refs: [
    { dialect: 'es-419', tokens: ['o', 'l', 'a'], stress: [0] },
    { dialect: 'es-ES', tokens: ['o', 'l', 'a'], stress: [0] },
  ],
  g2pVersion: SPEAK_G2P_VERSION,
  status: 'ready',
});

const baseSet = (overrides: Partial<FlashcardSet> = {}): FlashcardSet => ({
  id: 's1',
  title: 'Saludos',
  termLanguage: 'es',
  definitionLanguage: 'en-US',
  cards: [
    { id: 'c1', term: 'hola', definition: 'hello', speak: ready('hola') },
    { id: 'c2', term: 'adiós', definition: 'bye', speak: ready('adiós') },
  ],
  createdAt: 0,
  updatedAt: 1,
  ...overrides,
});

const auth = (speak: boolean) =>
  ({
    canAccessFeature: (id: string) => speak && id === 'flashcards-speak',
  }) as unknown as AuthContextType;

const lookup = vi.fn<SpeakLookupCall>((input) =>
  Promise.resolve({
    g2pVersion: SPEAK_G2P_VERSION,
    cards: Object.fromEntries(
      input.terms.map((t) => [t.cardId, ready(t.term)])
    ),
  })
);

const renderModal = (opts: {
  set?: FlashcardSet;
  isNew?: boolean;
  speak?: boolean;
}) => {
  const onPersist = vi.fn<
    (set: FlashcardSet, o: { final: boolean }) => Promise<void>
  >(() => Promise.resolve());
  const onClose = vi.fn();
  render(
    <AuthContext.Provider value={auth(opts.speak ?? false)}>
      <FlashcardSetEditorModal
        set={opts.set ?? baseSet()}
        isNew={opts.isNew ?? false}
        aiEnabled={false}
        onPersist={onPersist}
        onClose={onClose}
        speakLookup={lookup}
      />
    </AuthContext.Provider>
  );
  return { onPersist, onClose };
};

const clickClose = () => {
  const button = screen
    .getAllByRole('button', { name: 'Close' })
    .find((b) => b.textContent === 'Close');
  if (!button) throw new Error('No footer Close button');
  fireEvent.click(button);
};

afterEach(() => {
  vi.useRealTimers();
  lookup.mockClear();
  showConfirm.mockClear();
});

describe('FlashcardSetEditorModal', () => {
  it('autosaves edits without a Speak lookup, then looks up and saves on Close', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { onPersist, onClose } = renderModal({ speak: true });
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.change(screen.getByLabelText('Term 1'), {
      target: { value: 'buenos días' },
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    await waitFor(() => expect(onPersist).toHaveBeenCalledTimes(1));
    expect(onPersist.mock.calls[0][1]).toEqual({ final: false });
    expect(onPersist.mock.calls[0][0].cards[0].term).toBe('buenos días');
    // The stale reference is dropped, not re-looked-up, while typing.
    expect(onPersist.mock.calls[0][0].cards[0].speak).toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();

    clickClose();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lookup).toHaveBeenCalledTimes(1);
    const final = onPersist.mock.calls[onPersist.mock.calls.length - 1];
    expect(final[1]).toEqual({ final: true });
    expect(final[0].cards[0].speak?.term).toBe('buenos días');
  });

  it('closes an untouched set without writing it', async () => {
    const { onPersist, onClose } = renderModal({});
    clickClose();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onPersist).not.toHaveBeenCalled();
  });

  it('closes an untouched set with Speak on without a lookup or write', async () => {
    const set = baseSet({
      cards: [{ id: 'c1', term: 'gato', definition: 'cat' }],
    });
    const { onPersist, onClose } = renderModal({ set, speak: true });
    await act(async () => {
      await Promise.resolve();
    });
    clickClose();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lookup).not.toHaveBeenCalled();
    expect(onPersist).not.toHaveBeenCalled();
  });

  it('asks before closing when the last write fails', async () => {
    const { onPersist, onClose } = renderModal({
      isNew: true,
      set: baseSet({ title: '', updatedAt: 0 }),
    });
    onPersist.mockRejectedValue(new Error('offline'));
    showConfirm.mockResolvedValueOnce(false);
    clickClose();
    await waitFor(() => expect(showConfirm).toHaveBeenCalledTimes(1));
    await screen.findByText('Could not save your changes. Please try again.');
    expect(onClose).not.toHaveBeenCalled();
    clickClose();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('never writes an untouched blank new set', async () => {
    const { onPersist, onClose } = renderModal({
      isNew: true,
      set: baseSet({ title: '', cards: [], updatedAt: 0 }),
    });
    clickClose();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onPersist).not.toHaveBeenCalled();
  });

  it('writes a prefilled new set (paste, import) on Close', async () => {
    const { onPersist, onClose } = renderModal({
      isNew: true,
      set: baseSet({ title: '', updatedAt: 0 }),
    });
    clickClose();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onPersist).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1' }),
      { final: true }
    );
  });

  it('adds the next card on Enter in Definition', () => {
    renderModal({});
    fireEvent.keyDown(screen.getByLabelText('Definition 1'), { key: 'Enter' });
    expect(screen.getAllByPlaceholderText('Term')).toHaveLength(3);
    expect(screen.getByLabelText('Term 2')).toHaveProperty('value', '');
  });

  it('ignores Enter while an IME composition is open', () => {
    renderModal({});
    fireEvent.keyDown(screen.getByLabelText('Definition 1'), {
      key: 'Enter',
      isComposing: true,
    });
    expect(screen.getAllByPlaceholderText('Term')).toHaveLength(2);
  });
});

describe('flashcardSetIncompleteReason', () => {
  const card = (term: string, definition: string) => ({
    id: term + definition,
    term,
    definition,
  });
  it('names the first problem', () => {
    expect(flashcardSetIncompleteReason({ title: ' ', cards: [] })).toBe(
      'Set title is required'
    );
    expect(
      flashcardSetIncompleteReason({ title: 'A', cards: [card('', '')] })
    ).toBe('Add at least one card');
    expect(
      flashcardSetIncompleteReason({
        title: 'A',
        cards: [card('a', 'b'), card('', ''), card('c', '')],
      })
    ).toBe('Card 2: definition is required');
    expect(
      flashcardSetIncompleteReason({ title: 'A', cards: [card('', 'b')] })
    ).toBe('Card 1: term is required');
    expect(
      flashcardSetIncompleteReason({ title: 'A', cards: [card('a', 'b')] })
    ).toBeNull();
  });
});
