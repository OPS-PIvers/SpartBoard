import React from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { SubmissionCard } from './SubmissionCard';
import { DraggableCard, DropZone } from './dnd';
import { prepareSubmissions, wallScale } from './scale';
import type { WallRenderProps } from './types';

const UNSORTED_ID = '__unsorted';

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
  const items = prepareSubmissions(submissions, mode);
  const sections = session.sections ?? [];
  const isTeacher = mode === 'teacher';

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
    const target = event.over?.id;
    if (!onMove || typeof target !== 'string') return;
    onMove(String(event.active.id), {
      sectionId: target === UNSORTED_ID ? undefined : target,
    });
  };

  const board = (
    <div
      className="flex h-full w-full items-start overflow-auto"
      style={{ gap: scale.gap, padding: scale.pad }}
      data-testid="aw-layout-columns"
    >
      {columns.map((column) => (
        <DropZone
          key={column.id}
          id={column.id}
          disabled={!isTeacher}
          className="flex min-w-[180px] flex-1 flex-col rounded-xl border border-white/10 bg-white/5"
          style={{ gap: scale.gap, padding: scale.pad }}
        >
          <h3
            className="font-bold uppercase tracking-wide text-slate-200"
            style={{ fontSize: scale.heading }}
          >
            {column.label}
          </h3>
          {cardsFor(column.id).map((submission) => (
            <DraggableCard
              key={submission.id}
              id={submission.id}
              disabled={!isTeacher || !onMove}
            >
              <SubmissionCard
                submission={submission}
                mode={mode}
                showNames={showNames}
                {...actions}
              />
            </DraggableCard>
          ))}
        </DropZone>
      ))}
    </div>
  );

  if (!isTeacher || !onMove) return board;
  return <DndContext onDragEnd={handleDragEnd}>{board}</DndContext>;
};

export default ColumnsLayout;
