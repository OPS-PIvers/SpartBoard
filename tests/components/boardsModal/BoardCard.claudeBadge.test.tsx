import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { BoardCard } from '@/components/boardsModal/BoardCard';
import type { Dashboard } from '@/types';

const flag = vi.hoisted(() => ({ on: true }));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ pinBoard: vi.fn(), unpinBoard: vi.fn() }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: (id: string) => id === 'ai-boards' && flag.on,
  }),
}));

const renderCard = (extra: Partial<Dashboard>) =>
  render(
    <DndContext>
      <BoardCard
        board={{
          id: 'b1',
          name: 'Period 3',
          background: 'bg-slate-800',
          widgets: [],
          createdAt: 0,
          ...extra,
        }}
        isSelected={false}
        canShare
        onClick={vi.fn()}
        onToggleSelect={vi.fn()}
        onContextMenu={vi.fn()}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
        onShare={vi.fn()}
      />
    </DndContext>
  );

describe('BoardCard Claude badge', () => {
  it('says Made with Claude on a new unopened board', () => {
    flag.on = true;
    renderCard({ claudeAction: 'created', claudeUnseen: true });
    expect(screen.getByText('Made with Claude')).toBeTruthy();
  });

  it('says Edited by Claude on an edited unopened board', () => {
    flag.on = true;
    renderCard({ claudeAction: 'edited', claudeUnseen: true });
    expect(screen.getByText('Edited by Claude')).toBeTruthy();
  });

  it('goes away once the board is opened', () => {
    flag.on = true;
    renderCard({ claudeAction: 'edited' });
    expect(screen.queryByText('Edited by Claude')).toBeNull();
  });

  it('stays hidden with the flag off', () => {
    flag.on = false;
    renderCard({ claudeAction: 'created', claudeUnseen: true });
    expect(screen.queryByText('Made with Claude')).toBeNull();
  });
});
