import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { BoardBreadcrumb } from '@/components/layout/BoardBreadcrumb';
import type { useDashboard } from '@/context/useDashboard';

const useDashboardMock = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => useDashboardMock() as ReturnType<typeof useDashboard>,
}));
vi.mock('@/components/boardsModal/BoardsModal', () => ({
  BoardsModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Boards Modal">
      <button onClick={onClose}>close-modal</button>
    </div>
  ),
}));

const collection = (id: string, name: string) => ({
  id,
  name,
  parentCollectionId: null,
  order: 0,
  createdAt: 0,
});

describe('BoardBreadcrumb (transient)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when there is no active dashboard', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: null,
      collectionsApi: { collections: [] },
    });
    const { container } = render(<BoardBreadcrumb />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders on first mount with "No Collection" when active board has no Collection', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'My Board', collectionId: null },
      collectionsApi: { collections: [] },
    });
    render(<BoardBreadcrumb />);
    expect(screen.getByText('No Collection')).toBeInTheDocument();
    expect(screen.getByText('My Board')).toBeInTheDocument();
  });

  it('renders the Collection name when the active board is in a Collection', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'Warmup', collectionId: 'c1' },
      collectionsApi: { collections: [collection('c1', 'Math')] },
    });
    render(<BoardBreadcrumb />);
    expect(screen.getByText('Math')).toBeInTheDocument();
    expect(screen.getByText('Warmup')).toBeInTheDocument();
  });

  it('disappears after the 3-second display window', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'My Board', collectionId: null },
      collectionsApi: { collections: [] },
    });
    render(<BoardBreadcrumb />);
    expect(screen.getByText('My Board')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByText('My Board')).not.toBeInTheDocument();
  });

  it('re-appears when activeDashboard.id changes', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'Board A', collectionId: null },
      collectionsApi: { collections: [] },
    });
    const { rerender } = render(<BoardBreadcrumb />);
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByText('Board A')).not.toBeInTheDocument();

    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd2', name: 'Board B', collectionId: null },
      collectionsApi: { collections: [] },
    });
    rerender(<BoardBreadcrumb />);
    expect(screen.getByText('Board B')).toBeInTheDocument();
  });

  it('re-appears when activeDashboard.collectionId changes', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'Board A', collectionId: null },
      collectionsApi: { collections: [collection('c1', 'Math')] },
    });
    const { rerender } = render(<BoardBreadcrumb />);
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByText('Board A')).not.toBeInTheDocument();

    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'Board A', collectionId: 'c1' },
      collectionsApi: { collections: [collection('c1', 'Math')] },
    });
    rerender(<BoardBreadcrumb />);
    expect(screen.getByText('Board A')).toBeInTheDocument();
    expect(screen.getByText('Math')).toBeInTheDocument();
  });

  it('shows the pill exactly once when board and collection change in the same render', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'Board A', collectionId: 'c1' },
      collectionsApi: {
        collections: [collection('c1', 'Math'), collection('c2', 'Reading')],
      },
    });
    const { rerender } = render(<BoardBreadcrumb />);
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByText('Board A')).not.toBeInTheDocument();

    // Single render commit changes BOTH id and collectionId.
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd2', name: 'Board B', collectionId: 'c2' },
      collectionsApi: {
        collections: [collection('c1', 'Math'), collection('c2', 'Reading')],
      },
    });
    rerender(<BoardBreadcrumb />);
    expect(screen.getByText('Board B')).toBeInTheDocument();

    // 3.5s later the pill should be gone — one timer scheduled, not two.
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByText('Board B')).not.toBeInTheDocument();
  });

  it('opens BoardsModal when clicked during the display window', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'Board A', collectionId: null },
      collectionsApi: { collections: [] },
    });
    render(<BoardBreadcrumb />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /manage boards/i }));
    });
    expect(
      screen.getByRole('dialog', { name: 'Boards Modal' })
    ).toBeInTheDocument();
  });

  it('keeps the modal open after the display window expires', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'Board A', collectionId: null },
      collectionsApi: { collections: [] },
    });
    render(<BoardBreadcrumb />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /manage boards/i }));
    });
    expect(
      screen.getByRole('dialog', { name: 'Boards Modal' })
    ).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    // Component must NOT return null while modal is open.
    expect(
      screen.getByRole('dialog', { name: 'Boards Modal' })
    ).toBeInTheDocument();
  });
});
