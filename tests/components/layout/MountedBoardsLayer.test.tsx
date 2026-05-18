import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MountedBoardsLayer } from '@/components/layout/MountedBoardsLayer';
import type { MountedBoardsLayerProps } from '@/components/layout/MountedBoardsLayer';
import type { Dashboard } from '@/types';

vi.mock('@/components/layout/BoardCanvas', () => ({
  BoardCanvas: ({
    dashboard,
    isActive,
  }: {
    dashboard: Dashboard;
    isActive: boolean;
  }) => (
    <div
      data-testid={`canvas-${dashboard.id}`}
      data-active={isActive ? 'true' : 'false'}
    >
      {dashboard.name}
    </div>
  ),
}));

const board = (id: string): Dashboard => ({
  id,
  name: id,
  background: 'bg-slate-800',
  widgets: [],
  createdAt: 0,
  collectionId: null,
});

// Helper to satisfy the MountedBoardsLayer prop interface without making
// the test file declare the entire WidgetRenderer callback surface.
const noopProps = {
  isMinimized: false,
  animationClass: '',
  students: [],
  emptyStudents: [],
  selectedWidgetId: null,
  zoom: 1,
  globalStyle: {},
  updateSessionConfig: () => undefined,
  updateSessionBackground: () => undefined,
  startSession: () => undefined,
  endSession: () => undefined,
  removeStudent: () => undefined,
  toggleFreezeStudent: () => undefined,
  toggleGlobalFreeze: () => undefined,
  updateWidget: () => undefined,
  removeWidget: () => undefined,
  duplicateWidget: () => undefined,
  bringToFront: () => undefined,
  addToast: () => undefined,
  updateDashboardSettings: () => undefined,
} as unknown as Omit<
  MountedBoardsLayerProps,
  'activeId' | 'dashboards' | 'sessions'
>;

describe('MountedBoardsLayer', () => {
  it('mounts only the active Board on first render', () => {
    render(
      <MountedBoardsLayer
        activeId="a"
        dashboards={[board('a'), board('b')]}
        {...noopProps}
      />
    );
    expect(screen.getByTestId('canvas-a')).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(screen.queryByTestId('canvas-b')).not.toBeInTheDocument();
  });

  it('mounts pinned Boards even when they are not active', () => {
    const sessions = new Map<string, never>([
      ['b', { isActive: true } as never],
    ]);
    const { rerender } = render(
      <MountedBoardsLayer
        activeId="b"
        dashboards={[board('a'), board('b')]}
        sessions={sessions}
        {...noopProps}
      />
    );
    // Switch to 'a' — board 'b' should stay mounted because it is pinned
    // (in sessions), even though it is no longer active.
    rerender(
      <MountedBoardsLayer
        activeId="a"
        dashboards={[board('a'), board('b')]}
        sessions={sessions}
        {...noopProps}
      />
    );
    expect(screen.getByTestId('canvas-a')).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(screen.getByTestId('canvas-b')).toHaveAttribute(
      'data-active',
      'false'
    );
  });
});
