import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
