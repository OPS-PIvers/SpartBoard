import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { LibraryFolder } from '@/types';
import { FolderRowButton } from './FolderViewHeader';
import { LibraryRowWidthContext } from './LibraryRowWidthContext';

vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

const unit = {
  id: 'u',
  name: 'Unit 2',
  parentId: null,
  order: 0,
  createdAt: 0,
} as LibraryFolder;

const renderAt = (rowWidth: number) =>
  render(
    <LibraryRowWidthContext.Provider value={rowWidth}>
      <FolderRowButton
        row={{ folder: unit, label: '5 sets' }}
        viewMode="list"
        onOpen={vi.fn()}
      />
    </LibraryRowWidthContext.Provider>
  );

describe('FolderRowButton', () => {
  it('keeps the grip slot on wide rows and drops it on narrow ones, like item rows', () => {
    expect(renderAt(600).container.querySelector('span.w-6')).not.toBeNull();
    expect(renderAt(300).container.querySelector('span.w-6')).toBeNull();
  });
});
