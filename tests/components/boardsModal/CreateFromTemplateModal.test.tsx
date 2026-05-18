/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateFromTemplateModal } from '@/components/boardsModal/CreateFromTemplateModal';
import type { AnyTemplate } from '@/types';

const boardTemplate: AnyTemplate = {
  id: 'bt1',
  type: 'board',
  name: 'Board T',
  description: '',
  widgets: [],
  tags: [],
  targetGradeLevels: [],
  targetBuildings: [],
  enabled: true,
  accessLevel: 'public',
  createdAt: 1,
  updatedAt: 1,
  createdBy: 'a@b',
};

const collectionTemplate: AnyTemplate = {
  id: 'ct1',
  type: 'collection',
  name: 'Collection T',
  description: '',
  collectionSnapshot: { name: 'Collection T' },
  boardSnapshots: [
    {
      id: 'orig',
      name: 'Welcome',
      background: 'bg-slate-900',
      widgets: [],
      createdAt: 1,
    },
  ],
  tags: [],
  targetGradeLevels: [],
  targetBuildings: [],
  enabled: true,
  accessLevel: 'public',
  createdAt: 1,
  updatedAt: 1,
  createdBy: 'a@b',
};

let onSnapshotCallback: (snap: {
  docs: { id: string; data: () => unknown }[];
}) => void = () => undefined;

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn((_q, next) => {
    onSnapshotCallback = next;
    return () => undefined;
  }),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  isAuthBypass: false,
}));

const createCollection = vi.fn().mockResolvedValue('new-coll-id');
const setCollectionDefaultBoard = vi.fn().mockResolvedValue(undefined);
const deleteCollection = vi.fn().mockResolvedValue(undefined);
const createNewDashboard = vi.fn().mockResolvedValue('new-board-id');
const addToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    dashboards: [{ order: 4 }],
    createNewDashboard,
    addToast,
    collectionsApi: {
      createCollection,
      setCollectionDefaultBoard,
      deleteCollection,
    },
  }),
}));

beforeEach(() => {
  createCollection.mockClear();
  createNewDashboard.mockClear();
  setCollectionDefaultBoard.mockClear();
  deleteCollection.mockClear();
  addToast.mockClear();
  // Reset any per-test mockRejectedValue overrides so tests don't bleed into
  // each other.
  createNewDashboard.mockResolvedValue('new-board-id');
});

describe('CreateFromTemplateModal', () => {
  it('lists both Board and Collection templates with type badges', async () => {
    render(<CreateFromTemplateModal isOpen onClose={() => undefined} />);
    onSnapshotCallback({
      docs: [
        { id: 'bt1', data: () => boardTemplate },
        { id: 'ct1', data: () => collectionTemplate },
      ],
    });
    await waitFor(() => {
      expect(screen.getByText('Board T')).toBeInTheDocument();
      expect(screen.getByText('Collection T')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Board/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Collection/i).length).toBeGreaterThan(0);
  });

  it('hydrates a Collection template through createCollection + createNewDashboard', async () => {
    render(<CreateFromTemplateModal isOpen onClose={() => undefined} />);
    onSnapshotCallback({
      docs: [{ id: 'ct1', data: () => collectionTemplate }],
    });
    await waitFor(() => screen.getByText('Collection T'));
    fireEvent.click(screen.getByText('Collection T'));

    await waitFor(() => expect(createCollection).toHaveBeenCalledTimes(1));
    expect(createCollection).toHaveBeenCalledWith('Collection T', null);
    expect(createNewDashboard).toHaveBeenCalledTimes(1);
    const firstCallArgs = createNewDashboard.mock.calls[0];
    expect(firstCallArgs[0]).toBe('Welcome');
    expect(firstCallArgs[2]).toEqual({
      collectionId: 'new-coll-id',
      silent: true,
    });
  });

  it('hydrates a Board template through createNewDashboard at root', async () => {
    render(<CreateFromTemplateModal isOpen onClose={() => undefined} />);
    onSnapshotCallback({ docs: [{ id: 'bt1', data: () => boardTemplate }] });
    await waitFor(() => screen.getByText('Board T'));
    fireEvent.click(screen.getByText('Board T'));

    await waitFor(() => expect(createNewDashboard).toHaveBeenCalledTimes(1));
    expect(createCollection).not.toHaveBeenCalled();
    expect(createNewDashboard.mock.calls[0][0]).toBe('Board T');
  });

  it('rolls back the Collection when every Board creation fails', async () => {
    createNewDashboard.mockRejectedValue(new Error('boom'));
    const onClose = vi.fn();

    render(<CreateFromTemplateModal isOpen onClose={onClose} />);
    onSnapshotCallback({
      docs: [{ id: 'ct1', data: () => collectionTemplate }],
    });
    await waitFor(() => screen.getByText('Collection T'));
    fireEvent.click(screen.getByText('Collection T'));

    await waitFor(() => expect(createCollection).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(deleteCollection).toHaveBeenCalledWith('new-coll-id', 'delete-all')
    );
    expect(setCollectionDefaultBoard).not.toHaveBeenCalled();
    // onClose must NOT be called — modal stays open so user can retry
    expect(onClose).not.toHaveBeenCalled();
  });

  it('skips disabled templates', async () => {
    render(<CreateFromTemplateModal isOpen onClose={() => undefined} />);
    onSnapshotCallback({
      docs: [
        {
          id: 'bt1',
          data: () => ({ ...boardTemplate, enabled: false }),
        },
      ],
    });
    await waitFor(() => {
      expect(screen.queryByText('Board T')).not.toBeInTheDocument();
    });
  });
});
