import React from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { SubmissionCard } from './SubmissionCard';
import { DraggableCard, DropZone } from './dnd';
import { columnsDropPatch, UNSORTED_ID, useWallSensors } from './wallDrag';
import { prepareSubmissions, wallScale } from './scale';
import type { WallRenderProps } from './types';

/** Columns board: one droppable column per section plus an "Unsorted" catch-all. */
export const ColumnsLayout: React.FC<WallRenderProps> = ({
  session,
  submissions,
  mode,
  showNames,
  onMove,
  ...actions
}) => {
  const scale = wallScale(mode);
  const sensors = useWallSensors();
  const items = prepareSubmissions(submissions, mode);
  const sections = session.sections ?? [];
  // Drag belongs to whoever was handed a move callback; only the read-only gallery is exempt.
  const canMove = mode !== 'gallery' && Boolean(onMove);
  const columnMinWidth = mode === 'widget' ? 'min(180px, 60cqw)' : '180px';

  const columns = [...sections, { id: UNSORTED_ID, label: 'Unsorted' }].filter(
    (column) =>
      column.id !== UNSORTED_ID ||
      items.some(
        (submission) =>
          !submission.sectionId ||
          !sections.some((section) => section.id === submission.sectionId)
      )
  );

  const cardsFor = (columnId: string) =>
    items.filter((submission) => {
      const known = sections.some(
        (section) => section.id === submission.sectionId
      );
      return columnId === UNSORTED_ID
        ? !known
        : submission.sectionId === columnId;
    });

  const handleDragEnd = (event: DragEndEvent) => {
    const patch = columnsDropPatch(event);
    if (!onMove || !patch) return;
    onMove(String(event.active.id), patch);
  };

  const board = (
    <div
      className="flex h-full w-full items-start overflow-x-auto overflow-y-hidden"
      style={{
        gap: scale.gap,
        padding: scale.pad,
        scrollSnapType: 'x proximity',
        scrollbarGutter: 'stable',
        scrollbarWidth: 'thin',
      }}
      data-testid="aw-layout-columns"
    >
      {columns.map((column) => (
        <DropZone
          key={column.id}
          id={column.id}
          disabled={!canMove}
          className="flex h-full flex-1 flex-col rounded-xl border border-white/10 bg-white/5"
          style={{
            gap: scale.gap,
            padding: scale.pad,
            minWidth: columnMinWidth,
            scrollSnapAlign: 'start',
          }}
        >
          <h3
            className="shrink-0 font-bold uppercase tracking-wide text-slate-200"
            style={{ fontSize: scale.heading }}
          >
            {column.label}
          </h3>
          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
            style={{ gap: scale.gap }}
          >
            {cardsFor(column.id).map((submission) => (
              <DraggableCard
                key={submission.id}
                id={submission.id}
                disabled={!canMove}
                handleSize={scale.icon}
              >
                <SubmissionCard
                  submission={submission}
                  mode={mode}
                  showNames={showNames}
                  {...actions}
                />
              </DraggableCard>
            ))}
          </div>
        </DropZone>
      ))}
    </div>
  );

  if (!canMove) return board;
  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {board}
    </DndContext>
  );
};

export default ColumnsLayout;
