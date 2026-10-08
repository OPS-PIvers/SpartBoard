import { describe, it, expect } from 'vitest';
import type { CollisionDetection, DroppableContainer } from '@dnd-kit/core';
import {
  folderAwareCollisionDetection,
  folderRowDroppableId,
  itemMergeDroppableId,
} from './folderDropTargets';

type Args = Parameters<CollisionDetection>[0];

const rect = (top: number) => ({
  top,
  left: 0,
  width: 300,
  height: 60,
  right: 300,
  bottom: top + 60,
});

const container = (
  id: string,
  data: Record<string, unknown>
): DroppableContainer =>
  ({ id, data: { current: data }, disabled: false }) as DroppableContainer;

const ROWS = ['a', 'b'];
const containers = [
  container(folderRowDroppableId('f1'), { type: 'folder', folderId: 'f1' }),
  ...ROWS.flatMap((id) => [
    container(id, {}),
    container(itemMergeDroppableId(id), { type: 'item-merge', itemId: id }),
  ]),
];
const rects = new Map<string, ReturnType<typeof rect>>([
  [folderRowDroppableId('f1'), rect(0)],
  ['a', rect(60)],
  [itemMergeDroppableId('a'), rect(60)],
  ['b', rect(120)],
  [itemMergeDroppableId('b'), rect(120)],
]);

const hit = (activeId: string, y: number) =>
  folderAwareCollisionDetection({
    active: { id: activeId },
    collisionRect: { ...rect(y - 30) },
    droppableRects: rects,
    droppableContainers: containers,
    pointerCoordinates: { x: 150, y },
  } as unknown as Args)[0]?.id;

describe('folderAwareCollisionDetection', () => {
  it('drops on a folder row under the pointer', () => {
    expect(hit('a', 30)).toBe(folderRowDroppableId('f1'));
  });

  it('targets the middle of another row for create-folder', () => {
    expect(hit('a', 150)).toBe(itemMergeDroppableId('b'));
  });

  it('keeps reordering near a row edge', () => {
    expect(hit('a', 124)).toBe('b');
  });

  it('never merges an item with itself', () => {
    expect(hit('b', 150)).not.toBe(itemMergeDroppableId('b'));
  });
});
