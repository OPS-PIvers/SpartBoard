import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardNavFab } from '@/components/layout/BoardNavFab';
import type { useDashboard } from '@/context/useDashboard';

const useDashboardMock = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => useDashboardMock() as ReturnType<typeof useDashboard>,
}));
// BoardBreadcrumb has its own test file; stub it here so we focus on FAB logic.
vi.mock('@/components/layout/BoardBreadcrumb', () => ({
  BoardBreadcrumb: () => null,
}));
// Stub the modal — opened in Task 4. For Task 3 it's never reached.
vi.mock('@/components/boardsModal/BoardsModal', () => ({
  BoardsModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Boards Modal">
      <button onClick={onClose}>close-modal</button>
    </div>
  ),
}));

const dashboard = (
  id: string,
  name = id,
  collectionId: string | null = null
) => ({
  id,
  name,
  background: 'bg-slate-800',
  widgets: [],
  createdAt: 0,
  order: 0,
  collectionId,
  isPinned: false,
  isDefault: false,
});

const collection = (id: string, name = id) => ({
  id,
  name,
  parentCollectionId: null,
  order: 0,
  createdAt: 0,
});

const mockContext = (
  over: {
    dashboards?: ReturnType<typeof dashboard>[];
    collections?: ReturnType<typeof collection>[];
    active?: ReturnType<typeof dashboard> | null;
    loadDashboard?: ReturnType<typeof vi.fn>;
    setActiveCollectionId?: ReturnType<typeof vi.fn>;
  } = {}
) => {
  const dashboards = over.dashboards ?? [
    dashboard('d1', 'A'),
    dashboard('d2', 'B'),
  ];
  useDashboardMock.mockReturnValue({
    dashboards,
    activeDashboard: over.active ?? dashboards[0],
    loadDashboard: over.loadDashboard ?? vi.fn(),
    setActiveCollectionId: over.setActiveCollectionId ?? vi.fn(),
    collectionsApi: { collections: over.collections ?? [] },
  });
};

describe('BoardNavFab', () => {
  describe('visibility', () => {
    it('renders nothing when there is one board and no collections', () => {
      mockContext({ dashboards: [dashboard('d1', 'A')], collections: [] });
      const { container } = render(<BoardNavFab />);
      expect(container).toBeEmptyDOMElement();
    });

    it('renders the row when there is one board but at least one collection', () => {
      mockContext({
        dashboards: [dashboard('d1', 'A')],
        collections: [collection('c1', 'Math')],
      });
      render(<BoardNavFab />);
      expect(
        screen.getByRole('button', { name: /select board/i })
      ).toBeInTheDocument();
    });

    it('renders prev/next only when 2+ boards exist in the active collection', () => {
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [],
      });
      render(<BoardNavFab />);
      expect(
        screen.getByRole('button', { name: /previous board/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /next board/i })
      ).toBeInTheDocument();
    });

    it('hides prev/next when only 1 board in the active collection', () => {
      mockContext({
        dashboards: [dashboard('d1', 'A')],
        collections: [collection('c1', 'Math'), collection('c2', 'Reading')],
      });
      render(<BoardNavFab />);
      expect(
        screen.queryByRole('button', { name: /previous board/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /next board/i })
      ).not.toBeInTheDocument();
    });
  });

  describe('Collections button', () => {
    it('is hidden when collections.length is 0', () => {
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [],
      });
      render(<BoardNavFab />);
      expect(
        screen.queryByRole('button', { name: /select collection/i })
      ).not.toBeInTheDocument();
    });

    it('is hidden when collections.length is 1', () => {
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [collection('c1', 'Math')],
      });
      render(<BoardNavFab />);
      expect(
        screen.queryByRole('button', { name: /select collection/i })
      ).not.toBeInTheDocument();
    });

    it('is visible when collections.length is 2+', () => {
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [collection('c1', 'Math'), collection('c2', 'Reading')],
      });
      render(<BoardNavFab />);
      expect(
        screen.getByRole('button', { name: /select collection/i })
      ).toBeInTheDocument();
    });

    it('opens the CollectionSwitcherMenu when clicked', async () => {
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [collection('c1', 'Math'), collection('c2', 'Reading')],
      });
      render(<BoardNavFab />);
      await userEvent.click(
        screen.getByRole('button', { name: /select collection/i })
      );
      // CollectionSwitcherMenu renders the root + each collection.
      expect(
        screen.getByRole('menuitem', { name: /all boards \(root\)/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('menuitem', { name: 'Math' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('menuitem', { name: 'Reading' })
      ).toBeInTheDocument();
    });
  });

  describe('Boards menu', () => {
    it('opens when the boards button is clicked', async () => {
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [],
      });
      render(<BoardNavFab />);
      await userEvent.click(
        screen.getByRole('button', { name: /select board/i })
      );
      expect(screen.getByRole('menuitem', { name: /A/ })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /B/ })).toBeInTheDocument();
    });

    it('no longer contains a "Switch Collection…" item', async () => {
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [collection('c1', 'Math'), collection('c2', 'Reading')],
      });
      render(<BoardNavFab />);
      await userEvent.click(
        screen.getByRole('button', { name: /select board/i })
      );
      expect(
        screen.queryByRole('menuitem', { name: /switch collection/i })
      ).not.toBeInTheDocument();
    });

    it('loads the selected board on click', async () => {
      const loadDashboard = vi.fn();
      mockContext({
        dashboards: [dashboard('d1', 'A'), dashboard('d2', 'B')],
        collections: [],
        loadDashboard,
      });
      render(<BoardNavFab />);
      await userEvent.click(
        screen.getByRole('button', { name: /select board/i })
      );
      await userEvent.click(screen.getByRole('menuitem', { name: /B/ }));
      expect(loadDashboard).toHaveBeenCalledWith('d2');
    });
  });
});
