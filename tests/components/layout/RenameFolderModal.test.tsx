import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RenameFolderModal } from '@/components/layout/dock/RenameFolderModal';

describe('RenameFolderModal — blank name feedback', () => {
  it('shows an inline error and does not save when Save is clicked with a blank name', () => {
    const onSave = vi.fn();
    render(<RenameFolderModal name="" onClose={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getByText('Save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText(/name.*required|can.?t be empty/i)
    ).toBeInTheDocument();
  });

  it('shows an inline error and does not save when Enter is pressed with a whitespace-only name', () => {
    const onSave = vi.fn();
    render(
      <RenameFolderModal name="My Folder" onClose={vi.fn()} onSave={onSave} />
    );

    const input = screen.getByPlaceholderText('Folder name...');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText(/name.*required|can.?t be empty/i)
    ).toBeInTheDocument();
  });

  it('saves the trimmed name and shows no error on a valid submit', () => {
    const onSave = vi.fn();
    render(<RenameFolderModal name="" onClose={vi.fn()} onSave={onSave} />);

    const input = screen.getByPlaceholderText('Folder name...');
    fireEvent.change(input, { target: { value: '  Science Period 2  ' } });
    fireEvent.click(screen.getByText('Save'));

    expect(onSave).toHaveBeenCalledWith('Science Period 2');
    expect(
      screen.queryByText(/name.*required|can.?t be empty/i)
    ).not.toBeInTheDocument();
  });
});
