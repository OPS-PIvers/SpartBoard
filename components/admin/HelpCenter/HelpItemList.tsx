import React from 'react';
import { tourFieldAttr } from '@/config/tourAnchors';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { HelpItemKind, HelpResourceItem } from '@/types/helpCenter';

export interface HelpListSection {
  id: string;
  name: string;
}

export interface HelpRowInfo {
  kind: HelpItemKind;
  published: boolean;
  attention: boolean;
}

export const KIND_LABEL: Record<HelpItemKind, string> = {
  'live-tour': 'Live tour',
  'picture-guide': 'Picture guide',
};

const SECTION_PREFIX = 'section:';
const POINTER_OPTIONS = { activationConstraint: { distance: 8 } };
const KEYBOARD_OPTIONS = { coordinateGetter: sortableKeyboardCoordinates };

interface HelpItemListProps {
  sections: HelpListSection[];
  items: HelpResourceItem[];
  /** Off while a search or Show filter narrows the list. */
  draggable: boolean;
  canWrite: (item: HelpResourceItem) => boolean;
  infoOf: (item: HelpResourceItem) => HelpRowInfo;
  selectedId: string | null;
  highlighted: ReadonlySet<string>;
  onSelect: (id: string) => void;
  /** The item lands in this category; ids are that category's writable items in their new order. */
  onMove: (itemId: string, categoryId: string, orderedIds: string[]) => void;
}

const isSectionId = (id: string | number) =>
  String(id).startsWith(SECTION_PREFIX);

// Rows win over their section; a section catches a drop only on its empty space.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const rows = hits.filter((hit) => !isSectionId(hit.id));
  if (rows.length > 0) return rows;
  if (hits.length > 0) return hits;
  const rowContainers = args.droppableContainers.filter(
    (c) => !isSectionId(c.id)
  );
  return closestCenter({ ...args, droppableContainers: rowContainers });
};

const byOrder = (a: HelpResourceItem, b: HelpResourceItem) =>
  a.order - b.order || a.title.localeCompare(b.title);

/** The Help Center admin list: plain category headings, rows that drag within and between them. */
export const HelpItemList: React.FC<HelpItemListProps> = ({
  sections,
  items,
  draggable,
  canWrite,
  infoOf,
  selectedId,
  highlighted,
  onSelect,
  onMove,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_OPTIONS)
  );
  const inSection = (id: string) =>
    items.filter((item) => item.categoryId === id).sort(byOrder);
  const writableIds = (id: string) =>
    inSection(id)
      .filter(canWrite)
      .map((item) => item.id);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const moved = items.find((item) => item.id === String(active.id));
    if (!moved) return;
    const overId = String(over.id);
    const overItem = items.find((item) => item.id === overId);
    const target = isSectionId(overId)
      ? overId.slice(SECTION_PREFIX.length)
      : overItem?.categoryId;
    if (target === undefined) return;
    const ids = writableIds(target);
    if (target === moved.categoryId) {
      if (!overItem || overItem.id === moved.id) return;
      const from = ids.indexOf(moved.id);
      const to = ids.indexOf(overItem.id);
      if (from < 0 || to < 0) return;
      onMove(moved.id, target, arrayMove(ids, from, to));
      return;
    }
    const at = overItem ? ids.indexOf(overItem.id) : -1;
    const next = [...ids];
    next.splice(at < 0 ? next.length : at, 0, moved.id);
    onMove(moved.id, target, next);
  };

  const renderRow = (item: HelpResourceItem, handle: React.ReactNode) => {
    const info = infoOf(item);
    const selected = item.id === selectedId;
    return (
      <div
        className={`flex min-h-11 items-center rounded-lg ${
          selected
            ? 'bg-slate-100'
            : highlighted.has(item.id)
              ? 'bg-brand-blue-primary/5'
              : 'hover:bg-slate-50'
        }`}
      >
        {handle ?? <span className="w-8 shrink-0" aria-hidden="true" />}
        <button
          type="button"
          aria-current={selected ? 'true' : undefined}
          onClick={() => onSelect(item.id)}
          {...tourFieldAttr('admin.help-center.item-row', 'help', item.id)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg py-2 pr-3 text-left focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30"
        >
          <span className="min-w-0 flex-1">
            <span
              className={`block truncate text-sm ${selected ? 'font-semibold text-slate-900' : 'text-slate-800'}`}
            >
              {item.title}
            </span>
            <span className="block text-xs text-slate-500">
              {KIND_LABEL[info.kind]} ·{' '}
              {info.published ? 'Published' : 'Hidden'}
            </span>
          </span>
          {info.attention && (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
              role="img"
              aria-label="Needs attention"
            />
          )}
        </button>
      </div>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-5">
        {sections.map((section) => {
          const rows = inSection(section.id);
          return (
            <Section
              key={section.id || 'unfiled'}
              section={section}
              count={rows.length}
              draggable={draggable}
            >
              <SortableContext
                items={draggable ? rows.filter(canWrite).map((r) => r.id) : []}
                strategy={verticalListSortingStrategy}
              >
                {rows.map((item) =>
                  draggable && canWrite(item) ? (
                    <SortableRow key={item.id} id={item.id} title={item.title}>
                      {(handle) => renderRow(item, handle)}
                    </SortableRow>
                  ) : (
                    <div key={item.id}>{renderRow(item, null)}</div>
                  )
                )}
              </SortableContext>
            </Section>
          );
        })}
      </div>
    </DndContext>
  );
};

const Section: React.FC<{
  section: HelpListSection;
  count: number;
  draggable: boolean;
  children: React.ReactNode;
}> = ({ section, count, draggable, children }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `${SECTION_PREFIX}${section.id}`,
    disabled: !draggable,
  });
  const headingId = `help-section-${section.id || 'unfiled'}`;
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={`rounded-lg ${isOver ? 'bg-slate-50' : ''}`}
    >
      <h3
        id={headingId}
        className="flex items-baseline justify-between px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
      >
        {section.name}
        <span className="font-normal normal-case tracking-normal">{count}</span>
      </h3>
      {count === 0 ? (
        <p className="px-2 py-2 text-sm text-slate-400">No items.</p>
      ) : (
        children
      )}
    </section>
  );
};

const SortableRow: React.FC<{
  id: string;
  title: string;
  children: (handle: React.ReactNode) => React.ReactNode;
}> = ({ id, title, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children(
        <button
          type="button"
          aria-label={`Move ${title}`}
          {...tourFieldAttr('admin.help-center.item-drag', 'help', id)}
          {...attributes}
          {...listeners}
          className="flex h-11 w-8 shrink-0 cursor-grab items-center justify-center rounded-lg text-slate-400 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30"
        >
          <GripVertical className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
