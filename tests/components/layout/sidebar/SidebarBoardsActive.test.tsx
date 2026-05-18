import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SidebarBoardsActive } from '@/components/layout/sidebar/SidebarBoardsActive';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
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
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ lastActiveCollectionId: 'c1' }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

describe('SidebarBoardsActive', () => {
  it('renders only Boards in the active Collection', () => {
    const onOpenModal = vi.fn();
    render(<SidebarBoardsActive isVisible={true} onOpenModal={onOpenModal} />);
    expect(screen.getByText('Warm-up')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
  });

  it('calls onOpenModal when "Manage all boards" is clicked', () => {
    const onOpenModal = vi.fn();
    render(<SidebarBoardsActive isVisible={true} onOpenModal={onOpenModal} />);
    fireEvent.click(screen.getByRole('button', { name: /manage all boards/i }));
    expect(onOpenModal).toHaveBeenCalledTimes(1);
  });
});
