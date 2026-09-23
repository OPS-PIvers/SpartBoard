// Regression: LibraryToolbar's Sort dropdown had no Escape handling at all — it neither closed itself nor stopped propagation, so Escape fell through to whichever ancestor (widget/modal) owns Escape.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LibraryToolbar } from '@/components/common/library/LibraryToolbar';

afterEach(cleanup);

const sortOptions = [
  { key: 'name', label: 'Name' },
  { key: 'updatedAt', label: 'Last edited' },
];

describe('LibraryToolbar Sort dropdown — Escape closes it and does not leak to window-level handlers', () => {
  it('closes on Escape and stops propagation before it reaches window listeners', () => {
    render(
      <LibraryToolbar
        search=""
        onSearchChange={vi.fn()}
        sort={{ key: 'name', dir: 'asc' }}
        sortOptions={sortOptions}
        onSortChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();

    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);

    try {
      fireEvent.keyDown(listbox, { key: 'Escape', bubbles: true });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(windowKeydownSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydownSpy);
    }
  });
});
