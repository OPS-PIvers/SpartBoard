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
import { Modal } from '@/components/common/Modal';

describe('BoardsModal Escape with a stacked Modal', () => {
  it('leaves the Boards modal open when Escape closes a Modal stacked on top', () => {
    const onClose = vi.fn();
    const onStackedClose = vi.fn();
    render(
      <>
        <BoardsModal onClose={onClose} />
        <Modal isOpen onClose={onStackedClose} title="Stacked">
          <button>inside</button>
        </Modal>
      </>
    );
    fireEvent.keyDown(screen.getByText('inside'), { key: 'Escape' });
    expect(onStackedClose).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('still closes the Boards modal on Escape with nothing stacked', () => {
    const onClose = vi.fn();
    render(<BoardsModal onClose={onClose} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the Boards modal again once the stacked Modal has unmounted', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <>
        <BoardsModal onClose={onClose} />
        <Modal isOpen onClose={vi.fn()} title="Stacked">
          <button>inside</button>
        </Modal>
      </>
    );
    rerender(<BoardsModal onClose={onClose} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
