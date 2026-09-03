import React from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SubmissionCard } from './SubmissionCard';
import { AddSpot } from './AddSpot';
import { gapPlacement, showsAddSpots } from './addSpots';
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
      className="flex items-start"
      style={{
        gap: '4px',
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {!disabled && (
        <DragHandle
          attributes={attributes}
          listeners={listeners}
          size={handleSize}
        />
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};

/** Timeline: a single ordered column with a free-text label per post. */
export const TimelineLayout: React.FC<WallRenderProps> = ({
  submissions,
  mode,
  showNames,
  onMove,
  onAddAt,
  ...actions
}) => {
  const scale = wallScale(mode);
  const addSpots = showsAddSpots(mode, onAddAt);
  const sensors = useWallSensors();
  const items = sortForTimeline(visibleSubmissions(submissions, mode));
  // Drag belongs to whoever was handed a move callback; only the read-only gallery is exempt.
  const sortable = mode !== 'gallery' && Boolean(onMove);

  const handleDragEnd = (event: DragEndEvent) => {
    const patch = timelineDropPatch(items, event);
    if (!onMove || !patch) return;
    onMove(String(event.active.id), patch);
  };

  // Gap spots live in their own <li> so the sortable rows stay a clean id list.
  const gap = (index: number) =>
    addSpots ? (
      <li className="group flex justify-center border-l-2 border-transparent pl-3">
        <AddSpot
          mode={mode}
          placement={gapPlacement(items, index)}
          onAddAt={onAddAt}
        />
      </li>
    ) : null;

  const list = (
    <ol
      className="flex h-full w-full flex-col overflow-auto"
      style={{ gap: scale.gap, padding: scale.pad }}
      data-testid="aw-layout-timeline"
    >
      {gap(0)}
      {items.map((submission, index) => (
        <React.Fragment key={submission.id}>
          <li className="border-l-2 border-white/20 pl-3">
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
          {gap(index + 1)}
        </React.Fragment>
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
