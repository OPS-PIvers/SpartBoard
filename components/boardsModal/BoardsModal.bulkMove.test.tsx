import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Collection, Dashboard } from '@/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? _key,
  }),
}));

const collections: Collection[] = [
  {
    id: 'c1',
    name: 'Period 1',
    parentCollectionId: null,
    order: 0,
    createdAt: 1,
  },
];
const dashboards = [
  {
    id: 'b1',
    name: 'Board One',
    background: '',
    widgets: [],
    createdAt: 1,
    order: 0,
    collectionId: 'c1',
  },
] as Dashboard[];

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
    addToast: vi.fn(),
    collectionsApi: {
      collections,
      createCollection: vi.fn(),
      deleteCollection: vi.fn(),
      renameCollection: vi.fn(),
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
  useDialog: () => ({ showPrompt: vi.fn(), showConfirm: vi.fn() }),
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

describe('BoardsModal bulk move', () => {
  it('offers Root as a destination for a selection of boards', () => {
    render(<BoardsModal onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Select' })[0]);
    fireEvent.click(screen.getByRole('button', { name: /move/i }));
    expect(screen.getByText('Move to Collection')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Root \(no Collection\)/ })
    ).toBeInTheDocument();
  });
});
