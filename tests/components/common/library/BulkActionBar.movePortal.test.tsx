// Regression test: the bulk "Move" picker used the unanchored `absolute z-50`
// fallback, so it stacked inside the bar and the grid rows painted over it.
// Anchoring it portals the card to <body> above every row.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BulkActionBar } from '@/components/common/library/BulkActionBar';
import { Z_INDEX } from '@/config/zIndex';
import type { LibraryFolder } from '@/types';

const folders: LibraryFolder[] = [
  {
    id: 'folder-1',
    name: 'Schoology Guides',
    parentId: null,
    order: 0,
    createdAt: 1000,
  },
];

describe('BulkActionBar — move picker layering', () => {
  it('portals the picker out of the bar and above the rows', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const { container } = render(
      <BulkActionBar
        count={2}
        onClear={vi.fn()}
        folders={folders}
        onMove={onMove}
      />
    );

    await user.click(screen.getByRole('button', { name: /move/i }));
    const picker = await screen.findByRole('dialog');

    expect(container.contains(picker)).toBe(false);
    expect(picker.style.position).toBe('fixed');
    expect(picker.style.zIndex).toBe(String(Z_INDEX.modalNestedContent));
  });

  it('still commits the chosen folder', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(
      <BulkActionBar
        count={2}
        onClear={vi.fn()}
        folders={folders}
        onMove={onMove}
      />
    );

    await user.click(screen.getByRole('button', { name: /move/i }));
    await user.click(await screen.findByText('Schoology Guides'));

    expect(onMove).toHaveBeenCalledWith('folder-1');
  });
});
