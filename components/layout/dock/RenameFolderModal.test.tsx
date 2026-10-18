import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RenameFolderModal } from './RenameFolderModal';

describe('RenameFolderModal Enter', () => {
  it('ignores Enter that confirms an IME composition', () => {
    const onSave = vi.fn();
    render(<RenameFolderModal name="Math" onClose={vi.fn()} onSave={onSave} />);
    const input = screen.getByPlaceholderText('Folder name...');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves on a plain Enter', () => {
    const onSave = vi.fn();
    render(<RenameFolderModal name="Math" onClose={vi.fn()} onSave={onSave} />);
    fireEvent.keyDown(screen.getByPlaceholderText('Folder name...'), {
      key: 'Enter',
    });
    expect(onSave).toHaveBeenCalledWith('Math');
  });
});
