import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Collection, Dashboard } from '@/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? _key,
  }),
}));

const addToast = vi.fn();
const showPrompt = vi.fn();
const showConfirm = vi.fn();
const renameCollection = vi.fn();
const deleteCollection = vi.fn();

const collections: Collection[] = [
  {
    id: 'c1',
    name: 'Period 1',
    parentCollectionId: null,
    order: 0,
    createdAt: 1,
  },
];
const dashboards: Dashboard[] = [];

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    dashboards,
    activeDashboard: null,
    loadDashboard: vi.fn(),
    createNewDashboard: vi.fn(),
    deleteDashboard: vi.fn(),
    moveBoardToCollection: vi.fn(),
    pinBoard: vi.fn(),
    unpinBoard: vi.fn(),
    renameDashboard: vi.fn(),
    duplicateDashboard: vi.fn(),
    duplicateCollection: vi.fn(),
    setDefaultDashboard: vi.fn(),
    reorderDashboards: vi.fn(),
    addToast,
    collectionsApi: {
      collections,
      createCollection: vi.fn(),
      deleteCollection,
      renameCollection,
      setCollectionMetadata: vi.fn(),
      moveCollection: vi.fn(),
      reorderSiblings: vi.fn(),
    },
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ isAdmin: false, canAccessFeature: () => false }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showPrompt, showConfirm }),
}));
vi.mock('./useSubShares', () => ({
  useSubShares: () => ({
    shares: [],
    busyShareId: null,
    endsAtFor: () => null,
    refresh: vi.fn(),
    copyLink: vi.fn(),
    updateNow: vi.fn(),
    extend: vi.fn(),
    end: vi.fn(),
  }),
}));

import { BoardsModal } from './BoardsModal';

const openCollectionMenu = () => {
  render(<BoardsModal onClose={vi.fn()} />);
  const card = screen.getAllByText('Period 1').pop() as HTMLElement;
  fireEvent.contextMenu(card);
};

describe('BoardsModal collection menu failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toasts an error when renaming a collection fails', async () => {
    showPrompt.mockResolvedValue('New name');
    renameCollection.mockRejectedValue(new Error('offline'));
    openCollectionMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /rename/i }));
    await waitFor(() => expect(renameCollection).toHaveBeenCalled());
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.any(String), 'error')
    );
  });

  it('toasts an error when deleting a collection fails', async () => {
    showConfirm.mockResolvedValue(true);
    deleteCollection.mockRejectedValue(new Error('offline'));
    openCollectionMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /delete/i }));
    await waitFor(() => expect(deleteCollection).toHaveBeenCalled());
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.any(String), 'error')
    );
  });
});
