import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlashcardEditor } from './FlashcardEditor';
import type { FlashcardSet } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';

const set: FlashcardSet = {
  id: 's1',
  title: 'Set',
  termLanguage: 'en-US',
  definitionLanguage: 'en-US',
  cards: [
    { id: 'c1', term: 't1', definition: 'd1' },
    { id: 'c2', term: 't2', definition: 'd2' },
  ],
  createdAt: 0,
  updatedAt: 0,
};

const renderEditor = () =>
  render(
    <FlashcardEditor
      initialSet={set}
      saving={false}
      onCancel={vi.fn()}
      onSave={vi.fn()}
    />
  );

describe('FlashcardEditor definition Enter', () => {
  it('adds a card on a plain Enter', () => {
    renderEditor();
    fireEvent.keyDown(screen.getByLabelText('Definition 1'), { key: 'Enter' });
    expect(screen.getAllByPlaceholderText('Term')).toHaveLength(3);
  });

  it('does not add a card when Enter confirms an IME composition', () => {
    renderEditor();
    fireEvent.keyDown(screen.getByLabelText('Definition 1'), {
      key: 'Enter',
      isComposing: true,
    });
    expect(screen.getAllByPlaceholderText('Term')).toHaveLength(2);
  });
});

describe('FlashcardEditor set targets', () => {
  const tagged: FlashcardSet = {
    ...set,
    targets: [{ id: 'std:1', kind: 'standard', code: '1.1', label: 'Numbers' }],
  };
  const renderWith = (v2: boolean) => {
    const onSave = vi.fn((_set: FlashcardSet) => Promise.resolve());
    const auth = {
      canAccessFeature: (id: string) => v2 && id === 'flashcards-assign-v2',
    } as unknown as React.ContextType<typeof AuthContext>;
    render(
      <AuthContext.Provider value={auth}>
        <FlashcardEditor
          initialSet={tagged}
          saving={false}
          onCancel={vi.fn()}
          onSave={onSave}
        />
      </AuthContext.Provider>
    );
    return onSave;
  };

  it('shows the set targets with flashcards-assign-v2 and saves them', async () => {
    const onSave = renderWith(true);
    expect(screen.getByLabelText('Learning targets')).toHaveTextContent('1.1');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].targets).toEqual(tagged.targets);
  });

  it('hides the field without the flag but keeps existing targets on save', async () => {
    const onSave = renderWith(false);
    expect(screen.queryByLabelText('Learning targets')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].targets).toEqual(tagged.targets);
  });
});
