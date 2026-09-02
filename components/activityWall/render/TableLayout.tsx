import React from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { SubmissionCard } from './SubmissionCard';
import { DraggableCard, DropZone } from './dnd';
import { prepareSubmissions, wallScale } from './scale';
import type { WallRenderProps } from './types';

const cellKey = (rowId: string, colId: string) => `${rowId}|${colId}`;

/** Table board: every row/column intersection is a droppable cell. */
export const TableLayout: React.FC<WallRenderProps> = ({
  session,
  submissions,
  mode,
  showNames,
  onMove,
  ...actions
}) => {
  const scale = wallScale(mode);
  const items = prepareSubmissions(submissions, mode);
  const rows = session.tableRows ?? [];
  const cols = session.tableCols ?? [];
  const isTeacher = mode === 'teacher';

  const handleDragEnd = (event: DragEndEvent) => {
    const target = event.over?.id;
    if (!onMove || typeof target !== 'string') return;
    onMove(String(event.active.id), { cellKey: target });
  };

  const grid = (
    <div
      className="h-full w-full overflow-auto"
      style={{ padding: scale.pad }}
      data-testid="aw-layout-table"
    >
      <div
        className="grid min-w-full"
        style={{
          gap: scale.gap,
          gridTemplateColumns: `minmax(90px, 0.6fr) repeat(${Math.max(cols.length, 1)}, minmax(160px, 1fr))`,
        }}
      >
        <div />
        {cols.map((col) => (
          <h3
            key={col.id}
            className="font-bold uppercase tracking-wide text-slate-200"
            style={{ fontSize: scale.heading }}
          >
            {col.label}
          </h3>
        ))}
        {rows.map((row) => (
          <React.Fragment key={row.id}>
            <h3
              className="font-bold uppercase tracking-wide text-slate-200"
              style={{ fontSize: scale.heading }}
            >
              {row.label}
            </h3>
            {cols.map((col) => {
              const key = cellKey(row.id, col.id);
              return (
                <DropZone
                  key={key}
                  id={key}
                  disabled={!isTeacher}
                  className="flex flex-col rounded-xl border border-white/10 bg-white/5"
                  style={{ gap: scale.gap, padding: scale.pad }}
                >
                  {items
                    .filter((submission) => submission.cellKey === key)
                    .map((submission) => (
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
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );

  if (!isTeacher || !onMove) return grid;
  return <DndContext onDragEnd={handleDragEnd}>{grid}</DndContext>;
};

export default TableLayout;
