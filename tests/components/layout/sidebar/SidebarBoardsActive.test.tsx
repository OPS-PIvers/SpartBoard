import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SidebarBoardsActive } from '@/components/layout/sidebar/SidebarBoardsActive';
import type { Dashboard } from '@/types';

interface MockUseDashboardReturn {
  dashboards: Dashboard[];
  activeDashboard: Dashboard;
  loadDashboard: () => void;
}

interface MockUseAuthReturn {
  lastActiveCollectionId: string | null;
}

const mockUseDashboard = vi.fn<() => MockUseDashboardReturn>();
const mockUseAuth = vi.fn<() => MockUseAuthReturn>();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => mockUseDashboard(),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

describe('SidebarBoardsActive', () => {
  it('renders only Boards in the active Collection', () => {
    mockUseDashboard.mockReturnValue({
      dashboards: [
        {
          id: 'b1',
          name: 'Warm-up',
          collectionId: 'c1',
          createdAt: 0,
          background: '',
          widgets: [],
        },
        {
          id: 'b2',
          name: 'Activity',
          collectionId: 'c1',
          createdAt: 0,
          background: '',
          widgets: [],
        },
        {
          id: 'b3',
          name: 'Other',
          collectionId: 'c2',
          createdAt: 0,
          background: '',
          widgets: [],
        },
      ],
      activeDashboard: {
        id: 'b1',
        name: 'Warm-up',
        collectionId: 'c1',
        createdAt: 0,
        background: '',
        widgets: [],
      },
      loadDashboard: vi.fn(),
    });
    mockUseAuth.mockReturnValue({ lastActiveCollectionId: 'c1' });

    const onOpenModal = vi.fn();
    render(<SidebarBoardsActive isVisible={true} onOpenModal={onOpenModal} />);
    expect(screen.getByText('Warm-up')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
  });

  it('calls onOpenModal when "Manage all boards" is clicked', () => {
    mockUseDashboard.mockReturnValue({
      dashboards: [
        {
          id: 'b1',
          name: 'Warm-up',
          collectionId: 'c1',
          createdAt: 0,
          background: '',
          widgets: [],
        },
      ],
      activeDashboard: {
        id: 'b1',
        name: 'Warm-up',
        collectionId: 'c1',
        createdAt: 0,
        background: '',
        widgets: [],
      },
      loadDashboard: vi.fn(),
    });
    mockUseAuth.mockReturnValue({ lastActiveCollectionId: 'c1' });

    const onOpenModal = vi.fn();
    render(<SidebarBoardsActive isVisible={true} onOpenModal={onOpenModal} />);
    fireEvent.click(screen.getByRole('button', { name: /manage all boards/i }));
    expect(onOpenModal).toHaveBeenCalledTimes(1);
  });

  it('shows root boards, not a stale Collection, when the active board is legitimately at root', () => {
    // Regression: `??` treated a meaningful null collectionId as nullish.
    mockUseDashboard.mockReturnValue({
      dashboards: [
        {
          id: 'root1',
          name: 'Root Board',
          collectionId: null,
          createdAt: 0,
          background: '',
          widgets: [],
        },
        {
          id: 'c1-board',
          name: 'Collection Board',
          collectionId: 'c1',
          createdAt: 0,
          background: '',
          widgets: [],
        },
      ],
      activeDashboard: {
        id: 'root1',
        name: 'Root Board',
        collectionId: null,
        createdAt: 0,
        background: '',
        widgets: [],
      },
      loadDashboard: vi.fn(),
    });
    // Stale value left over from before the active board changed to root.
    mockUseAuth.mockReturnValue({ lastActiveCollectionId: 'c1' });

    const onOpenModal = vi.fn();
    render(<SidebarBoardsActive isVisible={true} onOpenModal={onOpenModal} />);
    expect(screen.getByText('Root Board')).toBeInTheDocument();
    expect(screen.queryByText('Collection Board')).not.toBeInTheDocument();
    expect(screen.getByText('Boards')).toBeInTheDocument();
  });
});
