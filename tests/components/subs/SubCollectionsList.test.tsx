import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubCollectionsList } from '@/components/subs/SubCollectionsList';
import type { SharedCollection } from '@/types';

const getDocsMock = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db: unknown, path: string) => ({ path })),
  query: vi.fn((...args: unknown[]) => ({ args })),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    field,
    op,
    value,
  })),
  getDocs: vi.fn(() => getDocsMock() as unknown),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const fakeCollection = (
  shareId: string,
  name: string,
  boardIds: string[],
  color?: string
): SharedCollection => ({
  shareId,
  hostUid: 'host-uid',
  hostDisplayName: 'Mr. Teacher',
  intendedMode: 'substitute',
  collection: { name, ...(color !== undefined && { color }) },
  boardIds,
  createdAt: 0,
  expiresAt: Date.now() + 86400000,
  buildingId: 'middle-school',
});

// Each doc needs an `id` property because the component does `shareId: d.id`
// to set the final shareId (spreading over the data's shareId field).
const docsResponse = (...collections: SharedCollection[]) => ({
  docs: collections.map((c) => ({ id: c.shareId, data: () => c })),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SubCollectionsList', () => {
  it('renders the loading state initially', () => {
    getDocsMock.mockReturnValueOnce(new Promise(() => undefined)); // never resolves
    render(
      <SubCollectionsList buildingId="middle-school" onOpenBoard={vi.fn()} />
    );
    expect(screen.getByText(/loading shared collections/i)).toBeInTheDocument();
  });

  it('renders nothing when no Collections are returned', async () => {
    getDocsMock.mockResolvedValueOnce(docsResponse());
    const { container } = render(
      <SubCollectionsList buildingId="middle-school" onOpenBoard={vi.fn()} />
    );
    await waitFor(() => {
      expect(
        screen.queryByText(/loading shared collections/i)
      ).not.toBeInTheDocument();
    });
    // After loading completes, nothing should render — the loading paragraph
    // is gone and no Collections section appears.
    expect(container.querySelector('section')).toBeNull();
  });

  it('renders one section per Collection with name + board count', async () => {
    getDocsMock.mockResolvedValueOnce(
      docsResponse(
        fakeCollection('s1', 'Math', ['b1', 'b2']),
        fakeCollection('s2', 'Reading', ['b3'])
      )
    );
    render(
      <SubCollectionsList buildingId="middle-school" onOpenBoard={vi.fn()} />
    );
    await waitFor(() => {
      expect(screen.getByText('Math')).toBeInTheDocument();
    });
    expect(screen.getByText('Reading')).toBeInTheDocument();
    // Math has 2 boards, Reading has 1
    expect(screen.getByText('2 board(s)')).toBeInTheDocument();
    expect(screen.getByText('1 board(s)')).toBeInTheDocument();
  });

  it('calls onOpenBoard(shareId, boardId) when a board button is clicked', async () => {
    const onOpenBoard = vi.fn();
    getDocsMock.mockResolvedValueOnce(
      docsResponse(fakeCollection('s1', 'Math', ['boardA-1234']))
    );
    render(
      <SubCollectionsList
        buildingId="middle-school"
        onOpenBoard={onOpenBoard}
      />
    );
    // Click the board button (label = "Board …1234" via boardId.slice(-4))
    const btn = await screen.findByRole('button', { name: /Board …1234/i });
    await userEvent.click(btn);
    expect(onOpenBoard).toHaveBeenCalledWith('s1', 'boardA-1234');
  });
});
