import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SortableList } from '@/components/common/SortableList';

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd: (event: {
      active: { id: string };
      over: { id: string } | null;
    }) => void;
  }) => {
    (
      globalThis as unknown as {
        __sortableListOnDragEnd?: typeof onDragEnd;
      }
    ).__sortableListOnDragEnd = onDragEnd;
    return <>{children}</>;
  },
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
  arrayMove: vi.fn(<T,>(arr: T[], from: number, to: number) => {
    const result = [...arr];
    result.splice(to, 0, result.splice(from, 1)[0]);
    return result;
  }),
  useSortable: () => ({
    attributes: { 'data-test-attr': 'sortable' },
    listeners: { onPointerDown: vi.fn() },
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: vi.fn(() => '') } },
}));

interface Item {
  id: string;
  label: string;
}

const items: Item[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Bravo' },
  { id: 'c', label: 'Charlie' },
];

describe('SortableList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as unknown as { __sortableListOnDragEnd?: unknown })
      .__sortableListOnDragEnd;
  });

  it('renders each item via renderItem', () => {
    render(
      <SortableList
        items={items}
        getId={(item) => item.id}
        onReorder={vi.fn()}
        renderItem={(item) => <div>{item.label}</div>}
      />
    );

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('passes drag handle attributes and listeners to renderItem', () => {
    render(
      <SortableList
        items={items.slice(0, 1)}
        getId={(item) => item.id}
        onReorder={vi.fn()}
        renderItem={(item, handle) => (
          <button
            data-testid={`handle-${item.id}`}
            {...handle.attributes}
            onPointerDown={
              handle.listeners?.onPointerDown as unknown as
                | React.PointerEventHandler<HTMLButtonElement>
                | undefined
            }
          >
            {item.label}
          </button>
        )}
      />
    );

    const handle = screen.getByTestId('handle-a');
    expect(handle).toHaveAttribute('data-test-attr', 'sortable');
  });

  it('calls onReorder with the moved array when DragEnd fires', () => {
    const onReorder = vi.fn();
    render(
      <SortableList
        items={items}
        getId={(item) => item.id}
        onReorder={onReorder}
        renderItem={(item) => <div>{item.label}</div>}
      />
    );

    const dragEnd = (
      globalThis as unknown as {
        __sortableListOnDragEnd?: (event: {
          active: { id: string };
          over: { id: string } | null;
        }) => void;
      }
    ).__sortableListOnDragEnd;
    expect(dragEnd).toBeTypeOf('function');
    dragEnd?.({ active: { id: 'a' }, over: { id: 'c' } });

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0][0]).toEqual([
      { id: 'b', label: 'Bravo' },
      { id: 'c', label: 'Charlie' },
      { id: 'a', label: 'Alpha' },
    ]);
    expect(onReorder.mock.calls[0][1]).toBe('a');
  });

  it('does nothing when dropped over its own position', () => {
    const onReorder = vi.fn();
    render(
      <SortableList
        items={items}
        getId={(item) => item.id}
        onReorder={onReorder}
        renderItem={(item) => <div>{item.label}</div>}
      />
    );

    const dragEnd = (
      globalThis as unknown as {
        __sortableListOnDragEnd?: (event: {
          active: { id: string };
          over: { id: string } | null;
        }) => void;
      }
    ).__sortableListOnDragEnd;
    dragEnd?.({ active: { id: 'a' }, over: { id: 'a' } });
    dragEnd?.({ active: { id: 'b' }, over: null });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('applies the optional className to the inner list container', () => {
    const { container } = render(
      <SortableList
        items={items.slice(0, 1)}
        getId={(item) => item.id}
        onReorder={vi.fn()}
        renderItem={(item) => <div>{item.label}</div>}
        className="my-custom-list"
      />
    );

    expect(container.querySelector('.my-custom-list')).not.toBeNull();
  });
});
