/**
 * Focused test for the `index` argument added to SortableList's renderItem
 * (perf: rows previously ran an O(n) findIndex per row per render).
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SortableList } from './SortableList';

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/modifiers', () => ({
  restrictToParentElement: vi.fn(),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: vi.fn(),
  rectSortingStrategy: vi.fn(),
  arrayMove: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: undefined,
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: vi.fn(() => '') } },
}));

describe('SortableList renderItem index', () => {
  it('passes each item position as the third renderItem argument', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    render(
      <SortableList
        items={items}
        getId={(item) => item.id}
        onReorder={vi.fn()}
        renderItem={(item, _handle, index) => (
          <div>{`${item.id}:${index}`}</div>
        )}
      />
    );
    expect(screen.getByText('a:0')).toBeInTheDocument();
    expect(screen.getByText('b:1')).toBeInTheDocument();
    expect(screen.getByText('c:2')).toBeInTheDocument();
  });
});
