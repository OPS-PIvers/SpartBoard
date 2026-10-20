import React from 'react';
import { SPEAK_G2P_VERSION } from '@/utils/pronunciation/g2pVersion';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlashcardEditor } from '../FlashcardEditor';
import { AuthContext } from '@/context/AuthContextValue';
import type { AuthContextType } from '@/context/AuthContextValue';
import type { FlashcardCardSpeak, FlashcardSet } from '@/types';
import { defaultFlashcardsSpeakAdminConfig } from '@/config/flashcardsSpeakAdmin';
import type { SpeakLookupCall } from './lookupSpeakReferences';

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

const spanishSet = (): FlashcardSet => ({
  id: 's1',
  title: 'Saludos',
  termLanguage: 'es',
  definitionLanguage: 'en-US',
  cards: [
    { id: 'c1', term: 'hola', definition: 'hello', speak: ready('hola') },
    { id: 'c2', term: 'adiós', definition: 'bye', speak: ready('adiós') },
  ],
  createdAt: 0,
  updatedAt: 0,
});

const authWith = (speak: boolean) =>
  ({
    canAccessFeature: (id: string) => speak && id === 'flashcards-speak',
  }) as unknown as AuthContextType;

const lookupReturning = (
  build: (term: string) => FlashcardCardSpeak = ready
): ReturnType<typeof vi.fn<SpeakLookupCall>> =>
  vi.fn<SpeakLookupCall>((input) =>
    Promise.resolve({
      g2pVersion: SPEAK_G2P_VERSION,
      cards: Object.fromEntries(
        input.terms.map((t) => [t.cardId, build(t.term)])
      ),
    })
  );

const renderEditor = (opts: {
  speak: boolean;
  set?: FlashcardSet;
  lookup?: SpeakLookupCall;
}) => {
  const onSave = vi.fn<(set: FlashcardSet) => Promise<void>>(() =>
    Promise.resolve()
  );
  render(
    <AuthContext.Provider value={authWith(opts.speak)}>
      <FlashcardEditor
        initialSet={opts.set ?? spanishSet()}
        saving={false}
        onCancel={vi.fn()}
        onSave={onSave}
        speakLookup={opts.lookup}
      />
    </AuthContext.Provider>
  );
  return { onSave };
};

const save = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('FlashcardEditor Speak', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows nothing and changes nothing without the flag', async () => {
    const lookup = lookupReturning();
    const { onSave } = renderEditor({ speak: false, lookup });
    expect(screen.queryByRole('heading', { name: 'Speak' })).toBeNull();
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(lookup).not.toHaveBeenCalled();
    const saved = onSave.mock.calls[0][0];
    expect(saved.speak).toBeUndefined();
    expect(saved.cards[0].speak).toEqual(ready('hola'));
  });

  it('moves the level to Custom when a sound row changes', async () => {
    renderEditor({ speak: true });
    const level = await screen.findByLabelText('Level');
    expect(level).toHaveValue('beginner');
    fireEvent.change(level, { target: { value: 'advanced' } });
    expect(screen.getByRole('switch', { name: 'Strict' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Advanced' })[0]);
    fireEvent.change(screen.getByLabelText('Rolled r (perro)'), {
      target: { value: 'forgive' },
    });
    expect(level).toHaveValue('custom');
  });

  it('saves its own settings only once the teacher changes them', async () => {
    const { onSave } = renderEditor({ speak: true, lookup: lookupReturning() });
    await screen.findByLabelText('Level');
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].speak).toBeUndefined();

    fireEvent.change(screen.getByLabelText('Attempts per card'), {
      target: { value: '5' },
    });
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0].speak).toMatchObject({
      attempts: 5,
      preset: 'beginner',
      dialects: ['es-419', 'es-ES'],
    });
  });

  it('looks up only new and changed terms', async () => {
    const lookup = lookupReturning();
    const { onSave } = renderEditor({ speak: true, lookup });
    await screen.findByLabelText('Level');
    fireEvent.change(screen.getByLabelText('Term 2'), {
      target: { value: 'gracias' },
    });
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup.mock.calls[0][0]).toEqual({
      voices: false,
      language: 'es',
      dialects: ['es-419', 'es-ES'],
      terms: [{ cardId: 'c2', term: 'gracias' }],
    });
    const saved = onSave.mock.calls[0][0];
    expect(saved.cards[0].speak).toEqual(ready('hola'));
    expect(saved.cards[1].speak?.term).toBe('gracias');
  });

  it('saves when the lookup fails and retries on the next save', async () => {
    const lookup = vi.fn<SpeakLookupCall>(() =>
      Promise.reject(new Error('offline'))
    );
    const { onSave } = renderEditor({ speak: true, lookup });
    await screen.findByLabelText('Level');
    fireEvent.change(screen.getByLabelText('Term 1'), {
      target: { value: 'buenos' },
    });
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].cards[0].speak).toMatchObject({
      term: 'buenos',
      status: 'unavailable',
      reasons: ['lookup-failed'],
    });
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(lookup.mock.calls[1][0].terms).toEqual([
      { cardId: 'c1', term: 'buenos' },
    ]);
  });

  it('lists flagged cards without blocking save, and confirms them', async () => {
    const set = spanishSet();
    set.cards[1].speak = {
      ...ready('adiós'),
      status: 'needs-review',
      reasons: ['stress-disagree'],
    };
    const { onSave } = renderEditor({
      speak: true,
      set,
      lookup: lookupReturning(),
    });
    expect(await screen.findByText('1 card to check')).toBeInTheDocument();
    expect(
      screen.getAllByText('Our sources disagree on which part is stressed.')
        .length
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: /^Looks right/ })[0]);
    expect(screen.queryByText('1 card to check')).toBeNull();
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].cards[1].speak?.confirmedAt).toEqual(
      expect.any(Number)
    );
  });

  it('re-looks up a card when its IPA changes, sending the override', async () => {
    const lookup = lookupReturning();
    const { onSave } = renderEditor({ speak: true, lookup });
    await screen.findByLabelText('Level');
    fireEvent.click(
      screen.getAllByRole('button', { name: /^Advanced\s*1$/ })[0]
    );
    const ipa = screen.getByLabelText(
      'Pronunciation (IPA), Latin American Spanish'
    );
    fireEvent.change(ipa, { target: { value: '#' } });
    expect(
      screen.getByText("Some of these symbols aren't recognized.")
    ).toBeInTheDocument();
    fireEvent.change(ipa, { target: { value: 'ˈola' } });
    expect(
      screen.queryByText("Some of these symbols aren't recognized.")
    ).toBeNull();
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(lookup.mock.calls[0][0].terms).toEqual([
      { cardId: 'c1', term: 'hola', ipaOverride: { 'es-419': 'ˈola' } },
    ]);
  });

  it('keeps typed IPA when the lookup fails', async () => {
    const lookup = vi.fn<SpeakLookupCall>(() =>
      Promise.reject(new Error('offline'))
    );
    const { onSave } = renderEditor({ speak: true, lookup });
    await screen.findByLabelText('Level');
    fireEvent.click(
      screen.getAllByRole('button', { name: /^Advanced\s*1$/ })[0]
    );
    fireEvent.change(
      screen.getByLabelText('Pronunciation (IPA), Latin American Spanish'),
      { target: { value: 'ˈola' } }
    );
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].cards[0].speak).toMatchObject({
      reasons: ['lookup-failed'],
      ipaOverride: { 'es-419': 'ˈola' },
    });
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(lookup.mock.calls[1][0].terms).toEqual([
      { cardId: 'c1', term: 'hola', ipaOverride: { 'es-419': 'ˈola' } },
    ]);
  });

  it('drops typed IPA once the term changes', async () => {
    const lookup = lookupReturning();
    const { onSave } = renderEditor({ speak: true, lookup });
    await screen.findByLabelText('Level');
    fireEvent.click(
      screen.getAllByRole('button', { name: /^Advanced\s*1$/ })[0]
    );
    fireEvent.change(
      screen.getByLabelText('Pronunciation (IPA), Latin American Spanish'),
      { target: { value: 'ˈola' } }
    );
    fireEvent.change(screen.getByLabelText('Term 1'), {
      target: { value: 'perro' },
    });
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(lookup.mock.calls[0][0].terms).toEqual([
      { cardId: 'c1', term: 'perro' },
    ]);
  });

  it("doesn't carry one language's settings to another", async () => {
    const set = spanishSet();
    set.speak = {
      dialects: ['es-419'],
      preset: 'beginner',
      strict: false,
      groups: { 'es-trill': 'forgive' },
      attempts: 4,
      example: true,
    };
    set.termLanguage = 'de-DE';
    const { onSave } = renderEditor({
      speak: true,
      set,
      lookup: lookupReturning(),
    });
    await screen.findByLabelText('Level');
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].speak).toBeUndefined();
  });

  it('explains when the term language has no Speak', async () => {
    renderEditor({
      speak: true,
      set: { ...spanishSet(), termLanguage: 'fr' },
    });
    expect(
      await screen.findByText(
        'Speak works when the term language is Spanish, German or English.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Level')).toBeNull();
  });
});
