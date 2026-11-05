import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { BoardCard } from '@/components/boardsModal/BoardCard';
import type { Dashboard } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ pinBoard: vi.fn(), unpinBoard: vi.fn() }),
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
    renderCard({ claudeAction: 'created', claudeUnseen: true });
    expect(screen.getByText('Made with Claude')).toBeTruthy();
  });

  it('says Edited by Claude on an edited unopened board', () => {
    renderCard({ claudeAction: 'edited', claudeUnseen: true });
    expect(screen.getByText('Edited by Claude')).toBeTruthy();
  });

  it('goes away once the board is opened', () => {
    renderCard({ claudeAction: 'edited' });
    expect(screen.queryByText('Edited by Claude')).toBeNull();
  });
});
