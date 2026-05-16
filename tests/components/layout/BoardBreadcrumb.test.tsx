import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardBreadcrumb } from '@/components/layout/BoardBreadcrumb';
import type { useDashboard } from '@/context/useDashboard';
import type { useAuth } from '@/context/useAuth';
import type { useCollections } from '@/hooks/useCollections';

const useDashboardMock = vi.fn();
const useAuthMock = vi.fn();
const useCollectionsMock = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => useDashboardMock() as ReturnType<typeof useDashboard>,
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => useAuthMock() as ReturnType<typeof useAuth>,
}));
vi.mock('@/hooks/useCollections', () => ({
  useCollections: () =>
    useCollectionsMock() as ReturnType<typeof useCollections>,
}));
vi.mock('@/components/boardsModal/BoardsModal', () => ({
  BoardsModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Boards Modal">
      <button onClick={onClose}>close-modal</button>
    </div>
  ),
}));

beforeEach(() => {
  useAuthMock.mockReturnValue({ user: { uid: 'u1' } });
});

describe('BoardBreadcrumb', () => {
  it('renders nothing when no active dashboard', () => {
    useDashboardMock.mockReturnValue({ activeDashboard: null });
    useCollectionsMock.mockReturnValue({ collections: [] });
    const { container } = render(<BoardBreadcrumb />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders "All Boards" when the active dashboard is at root', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'My Board', collectionId: null },
    });
    useCollectionsMock.mockReturnValue({ collections: [] });
    render(<BoardBreadcrumb />);
    expect(screen.getByText('All Boards')).toBeInTheDocument();
    expect(screen.getByText('My Board')).toBeInTheDocument();
  });

  it('renders the Collection name when the active dashboard is in a Collection', () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'Warmup', collectionId: 'c1' },
    });
    useCollectionsMock.mockReturnValue({
      collections: [
        {
          id: 'c1',
          name: 'Math',
          parentCollectionId: null,
          order: 0,
          createdAt: 0,
        },
      ],
    });
    render(<BoardBreadcrumb />);
    expect(screen.getByText('Math')).toBeInTheDocument();
    expect(screen.getByText('Warmup')).toBeInTheDocument();
  });

  it('opens the BoardsModal when clicked', async () => {
    useDashboardMock.mockReturnValue({
      activeDashboard: { id: 'd1', name: 'Warmup', collectionId: null },
    });
    useCollectionsMock.mockReturnValue({ collections: [] });
    render(<BoardBreadcrumb />);
    await userEvent.click(
      screen.getByRole('button', { name: /manage boards/i })
    );
    expect(
      screen.getByRole('dialog', { name: 'Boards Modal' })
    ).toBeInTheDocument();
  });
});
