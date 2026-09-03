import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityWallLibraryEntry } from '@/types';

let postCount = 2;
const mockGetCountFromServer = vi.fn(() =>
  Promise.resolve({ data: () => ({ count: postCount }) })
);

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  deleteDoc: vi.fn(() => Promise.resolve()),
  doc: vi.fn(() => ({})),
  getCountFromServer: () => mockGetCountFromServer(),
}));
vi.mock('./hooks/useActivityWallSession', () => ({
  clearWallSubmissions: vi.fn(() => Promise.resolve()),
}));

import { WallLibraryModal } from './WallLibraryModal';

const entry: ActivityWallLibraryEntry = {
  id: 'wall-1',
  title: 'Exit ticket',
  prompt: 'What did you learn?',
  mode: 'text',
  moderationEnabled: false,
  identificationMode: 'anonymous',
  createdAt: 1,
  updatedAt: 2,
  layout: 'wall',
};

const modal = (open: boolean) => (
  <WallLibraryModal
    open={open}
    onClose={vi.fn()}
    uid="teacher-1"
    entries={[entry]}
    activeEntryId={null}
    readOnly={false}
    onOpenOnBoard={vi.fn()}
    onCreate={vi.fn()}
    onEdit={vi.fn()}
    onDuplicate={vi.fn(() => Promise.resolve())}
    onDelete={vi.fn(() => Promise.resolve())}
    addToast={vi.fn()}
    confirm={() => true}
  />
);

const libraryModal = (entries: ActivityWallLibraryEntry[]) => (
  <WallLibraryModal
    open
    onClose={vi.fn()}
    uid="teacher-1"
    entries={entries}
    activeEntryId={null}
    readOnly={false}
    onOpenOnBoard={vi.fn()}
    onCreate={vi.fn()}
    onEdit={vi.fn()}
    onDuplicate={vi.fn(() => Promise.resolve())}
    onDelete={vi.fn(() => Promise.resolve())}
    addToast={vi.fn()}
    confirm={() => true}
  />
);

describe('WallLibraryModal post counts', () => {
  beforeEach(() => {
    postCount = 2;
    mockGetCountFromServer.mockClear();
  });

  it('refetches counts each time the modal reopens', async () => {
    const { rerender } = render(modal(true));
    expect(await screen.findByText(/2 posts/)).toBeInTheDocument();
    expect(mockGetCountFromServer).toHaveBeenCalledTimes(1);

    rerender(modal(false));
    postCount = 5;
    rerender(modal(true));

    await waitFor(() =>
      expect(screen.getByText(/5 posts/)).toBeInTheDocument()
    );
    expect(mockGetCountFromServer).toHaveBeenCalledTimes(2);
  });
});

describe('WallLibraryModal empty state', () => {
  it('shows the ScaledEmptyState with a create action when the library has no walls', () => {
    render(libraryModal([]));

    expect(screen.getByText('No Walls Yet')).toBeInTheDocument();
    expect(
      screen.getByText('Create your first Activity Wall to get started.')
    ).toBeInTheDocument();
    // One "New wall" button from the empty state's own action, plus the
    // toolbar's persistent primary action — both must be present.
    expect(screen.getAllByRole('button', { name: 'New wall' })).toHaveLength(2);
  });

  it('shows a text-only "no match" fallback (no action button) when a search matches nothing', async () => {
    const user = userEvent.setup();
    render(libraryModal([entry]));

    await user.type(
      screen.getByPlaceholderText('Search walls…'),
      'nonexistent search term'
    );

    expect(screen.getByText('No walls match your search.')).toBeInTheDocument();
    expect(screen.queryByText('No Walls Yet')).not.toBeInTheDocument();
    // Only the toolbar's persistent primary action remains — the empty
    // state itself renders no action button for a filtered-no-match result.
    expect(screen.getAllByRole('button', { name: 'New wall' })).toHaveLength(1);
  });
});
