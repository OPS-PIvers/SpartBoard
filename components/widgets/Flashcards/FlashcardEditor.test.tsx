import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlashcardEditor } from './FlashcardEditor';
import type { FlashcardSet } from '@/types';

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
