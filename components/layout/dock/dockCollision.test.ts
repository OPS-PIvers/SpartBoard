import { describe, it, expect } from 'vitest';
import type { CollisionDetection } from '@dnd-kit/core';
import { createDockCollisionDetection } from '@/components/layout/dock/dockCollision';

type Args = Parameters<CollisionDetection>[0];

const rect = (left: number) => ({
  left,
  top: 0,
  right: left + 50,
  bottom: 50,
  width: 50,
  height: 50,
});

const run = (activeId: string, dragLeft: number, folders: string[]) => {
  const slots: Record<string, number> = { folder: 0, toolA: 60, toolB: 120 };
  const droppableRects = new Map(
    Object.entries(slots).map(([id, left]) => [id, rect(left)])
  );
  const droppableContainers = Object.keys(slots).map((id) => ({
    id,
    key: id,
    data: { current: undefined },
    disabled: false,
    node: { current: null },
    rect: { current: rect(slots[id]) },
  }));
  const r = rect(dragLeft);
  const args = {
    active: { id: activeId },
    collisionRect: r,
    droppableRects,
    droppableContainers,
    pointerCoordinates: null,
  } as unknown as Args;
  return createDockCollisionDetection(new Set(folders))(args).map((c) => c.id);
};

describe('createDockCollisionDetection', () => {
  it('lets a dragged folder reorder past a neighbouring tool', () => {
    // Dragged folder is mostly over toolA but still slightly overlaps its own slot.
    expect(run('folder', 40, ['folder'])[0]).toBe('toolA');
  });

  it('still targets another folder for grouping/drop', () => {
    expect(run('toolA', 5, ['folder'])[0]).toBe('folder');
  });
});
