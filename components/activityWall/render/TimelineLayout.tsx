import React from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SubmissionCard } from './SubmissionCard';
import { DragHandle } from './dnd';
import { timelineDropPatch, useWallSensors } from './wallDrag';
import { sortForTimeline, visibleSubmissions, wallScale } from './scale';
import type { WallRenderProps } from './types';

const SortableRow: React.FC<{
  id: string;
  disabled: boolean;
  handleSize: string;
  children: React.ReactNode;
}> = ({ id, disabled, handleSize, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      className="relative"
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {!disabled && (
        <DragHandle
          attributes={attributes}
          listeners={listeners}
          size={handleSize}
        />
      )}
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
  const sensors = useWallSensors();
  const items = sortForTimeline(visibleSubmissions(submissions, mode));
  const isTeacher = mode === 'teacher';
  const sortable = isTeacher && Boolean(onMove);

  const handleDragEnd = (event: DragEndEvent) => {
    const patch = timelineDropPatch(items, event);
    if (!onMove || !patch) return;
    onMove(String(event.active.id), patch);
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
            <SortableRow
              id={submission.id}
              disabled={false}
              handleSize={scale.icon}
            >
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
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
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
