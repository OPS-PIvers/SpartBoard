import React from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ActivityWallSubmission } from '@/types';
import { SubmissionCard } from './SubmissionCard';
import { sortForTimeline, visibleSubmissions, wallScale } from './scale';
import type { WallRenderProps } from './types';

const orderValue = (submission: ActivityWallSubmission): number =>
  typeof submission.order === 'number'
    ? submission.order
    : submission.submittedAt;

/** Midpoint between the neighbours the card lands between; keeps `order` a float. */
const orderForIndex = (
  items: ActivityWallSubmission[],
  fromIndex: number,
  toIndex: number
): number => {
  const without = items.filter((_, index) => index !== fromIndex);
  const before = without[toIndex - 1];
  const after = without[toIndex];
  if (!before && !after) return 0;
  if (!before) return orderValue(after) - 1;
  if (!after) return orderValue(before) + 1;
  return (orderValue(before) + orderValue(after)) / 2;
};

const SortableRow: React.FC<{
  id: string;
  disabled: boolean;
  children: React.ReactNode;
}> = ({ id, disabled, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
};

/** Timeline: a single ordered column with a free-text label per post. */
export const TimelineLayout: React.FC<WallRenderProps> = ({
  submissions,
  mode,
  showNames,
  onMove,
  ...actions
}) => {
  const scale = wallScale(mode);
  const items = sortForTimeline(visibleSubmissions(submissions, mode));
  const isTeacher = mode === 'teacher';
  const sortable = isTeacher && Boolean(onMove);

  const handleDragEnd = (event: DragEndEvent) => {
    if (!onMove || !event.over) return;
    const fromIndex = items.findIndex((item) => item.id === event.active.id);
    const toIndex = items.findIndex((item) => item.id === event.over?.id);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    onMove(String(event.active.id), {
      order: orderForIndex(items, fromIndex, toIndex),
    });
  };

  const list = (
    <ol
      className="flex h-full w-full flex-col overflow-auto"
      style={{ gap: scale.gap, padding: scale.pad }}
      data-testid="aw-layout-timeline"
    >
      {items.map((submission) => (
        <li key={submission.id} className="border-l-2 border-white/20 pl-3">
          {sortable ? (
            <SortableRow id={submission.id} disabled={false}>
              <SubmissionCard
                submission={submission}
                mode={mode}
                showNames={showNames}
                footnote={submission.label}
                {...actions}
              />
            </SortableRow>
          ) : (
            <SubmissionCard
              submission={submission}
              mode={mode}
              showNames={showNames}
              footnote={submission.label}
              {...actions}
            />
          )}
        </li>
      ))}
    </ol>
  );

  if (!sortable) return list;
  return (
    <DndContext onDragEnd={handleDragEnd}>
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        {list}
      </SortableContext>
    </DndContext>
  );
};

export default TimelineLayout;
