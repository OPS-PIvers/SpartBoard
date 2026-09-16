import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { BoardCard } from '@/components/boardsModal/BoardCard';
import type { Dashboard } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ pinBoard: vi.fn(), unpinBoard: vi.fn() }),
}));

const board: Dashboard = {
  id: 'b1',
  name: 'Period 3',
  background: 'bg-slate-800',
  widgets: [],
  createdAt: 0,
};

const renderCard = (overrides: Partial<Parameters<typeof BoardCard>[0]>) =>
  render(
    <DndContext>
      <BoardCard
        board={board}
        isSelected={false}
        canShare
        onClick={vi.fn()}
        onToggleSelect={vi.fn()}
        onContextMenu={vi.fn()}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
        onShare={vi.fn()}
        {...overrides}
      />
    </DndContext>
  );

describe('BoardCard edit button', () => {
  it('opens the action menu anchored to the button without opening the board', () => {
    const onEdit = vi.fn();
    const onClick = vi.fn();
    renderCard({ onEdit, onClick });
    const button = screen.getByRole('button', { name: 'Edit board' });
    fireEvent.click(button);
    expect(onEdit).toHaveBeenCalledWith(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('sits immediately before the Share button', () => {
    renderCard({});
    const edit = screen.getByRole('button', { name: 'Edit board' });
    expect(edit.nextElementSibling).toBe(
      screen.getByRole('button', { name: 'Share' })
    );
  });
});
