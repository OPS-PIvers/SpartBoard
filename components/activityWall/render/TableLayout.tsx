import React from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { SubmissionCard } from './SubmissionCard';
import { AddSpot } from './AddSpot';
import { showsAddSpots } from './addSpots';
import { DraggableCard, DropZone } from './dnd';
import { tableDropPatch, UNSORTED_ID, useWallSensors } from './wallDrag';
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
  onAddAt,
  ...actions
}) => {
  const scale = wallScale(mode);
  const addSpots = showsAddSpots(mode, onAddAt);
  const sensors = useWallSensors();
  const items = prepareSubmissions(submissions, mode);
  const rows = session.tableRows ?? [];
  const cols = session.tableCols ?? [];
  // Drag belongs to whoever was handed a move callback; only the read-only gallery is exempt.
  const canMove = mode !== 'gallery' && Boolean(onMove);
  const isWidget = mode === 'widget';
  const labelTrack = isWidget
    ? 'minmax(min(90px, 20cqw), 0.6fr)'
    : 'minmax(90px, 0.6fr)';
  const cellTrack = isWidget
    ? 'minmax(min(160px, 35cqw), 1fr)'
    : 'minmax(160px, 1fr)';

  const validKeys = new Set(
    rows.flatMap((row) => cols.map((col) => cellKey(row.id, col.id)))
  );
  const unsorted = items.filter(
    (submission) => !submission.cellKey || !validKeys.has(submission.cellKey)
  );

  const renderCards = (cards: typeof items) =>
    cards.map((submission) => (
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
    ));

  const handleDragEnd = (event: DragEndEvent) => {
    const patch = tableDropPatch(event);
    if (!onMove || !patch) return;
    onMove(String(event.active.id), patch);
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
          gridTemplateColumns: `${labelTrack} repeat(${Math.max(cols.length, 1)}, ${cellTrack})`,
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
                  disabled={!canMove}
                  className="group flex flex-col rounded-xl border border-white/10 bg-white/5"
                  style={{ gap: scale.gap, padding: scale.pad }}
                >
                  {renderCards(
                    items.filter((submission) => submission.cellKey === key)
                  )}
                  {addSpots && (
                    <AddSpot
                      mode={mode}
                      placement={{ cellKey: key }}
                      onAddAt={onAddAt}
                      className="self-center"
                    />
                  )}
                </DropZone>
              );
            })}
          </React.Fragment>
        ))}
        {unsorted.length > 0 && (
          <>
            <h3
              className="font-bold uppercase tracking-wide text-slate-200"
              style={{ fontSize: scale.heading }}
            >
              Unsorted
            </h3>
            <DropZone
              id={UNSORTED_ID}
              disabled={!canMove}
              className="flex flex-col rounded-xl border border-white/10 bg-white/5"
              style={{
                gap: scale.gap,
                padding: scale.pad,
                gridColumn: `span ${Math.max(cols.length, 1)}`,
              }}
            >
              {renderCards(unsorted)}
            </DropZone>
          </>
        )}
      </div>
    </div>
  );

  if (!canMove) return grid;
  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {grid}
    </DndContext>
  );
};

export default TableLayout;
