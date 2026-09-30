import React from 'react';
import { spaNavigate } from '@/utils/plcPath';
import { buildGradebookPath } from '@/utils/gradebookPath';
import { useGradebook, type GradebookColumn } from './GradebookContext';
import { cellAnchorId } from './cellFormat';
import { GradebookCellPopover } from './cell/GradebookCellPopover';
import { GradebookHeaderPopover } from './header/GradebookHeaderPopover';
import { GradebookPushScoresButton } from './header/GradebookPushScoresButton';
import type { GradebookCellData, GradebookColumnRef } from './slotTypes';

const findAnchor = (attr: string, value: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[${attr}="${CSS.escape(value)}"]`);

const columnRef = (c: GradebookColumn): GradebookColumnRef => ({
  sessionId: c.sessionId,
  kind: c.kind,
  title: c.title,
  dueAt: c.dueAt,
  closeAt: c.closeAt,
  config: c.config,
});

/** Mounts the cell and header popover slots against their anchors. */
export const GradebookPopovers: React.FC<{
  onCellClose: (reason?: 'enter') => void;
}> = ({ onCellClose }) => {
  const gb = useGradebook();
  const { popover, closePopover, allColumns, students, getCell } = gb;
  if (!popover) return null;
  const column = allColumns.find((c) => c.sessionId === popover.sessionId);
  if (!column) return null;
  const ctx = { rosterId: gb.rosterId, settings: gb.settings, now: gb.now };
  const columnCells: GradebookCellData[] = students.map((s) => {
    const cell = getCell(column.sessionId, s.uid);
    return {
      student: { uid: s.uid, name: s.displayName, firstName: s.firstName },
      row: cell.row,
      mark: cell.mark,
      final: cell.final,
    };
  });

  if (popover.type === 'cell') {
    const anchor = findAnchor(
      'data-gb-cell',
      cellAnchorId(popover.sessionId, popover.studentUid)
    );
    const cell = columnCells.find((c) => c.student.uid === popover.studentUid);
    if (!anchor || !cell) return null;
    return (
      <GradebookCellPopover
        key={cellAnchorId(popover.sessionId, popover.studentUid)}
        anchor={anchor}
        ctx={ctx}
        column={columnRef(column)}
        cell={cell}
        columnCells={columnCells}
        prefill={popover.prefill ?? undefined}
        onClose={onCellClose}
        onNotify={gb.toast}
      />
    );
  }

  const anchor = findAnchor('data-gb-head', popover.sessionId);
  if (!anchor) return null;
  return (
    <GradebookHeaderPopover
      key={popover.sessionId}
      anchor={anchor}
      ctx={ctx}
      column={columnRef(column)}
      columnCells={columnCells}
      onClose={closePopover}
      onNotify={gb.toast}
      pushControl={
        <GradebookPushScoresButton
          column={columnRef(column)}
          columnCells={columnCells}
          onNotify={gb.toast}
        />
      }
      sortedByColumn={
        gb.view.sort.key === 'column' && gb.view.sort.ref === column.sessionId
      }
      onAnalyze={(c) =>
        spaNavigate(buildGradebookPath(gb.rosterId, 'assignment', c.sessionId))
      }
      onSortByColumn={(c) => {
        const s = gb.view.sort;
        const same = s.key === 'column' && s.ref === c.sessionId;
        gb.setView({
          sort: {
            key: 'column',
            ref: c.sessionId,
            dir: same && s.dir === 'desc' ? 'asc' : 'desc',
          },
        });
      }}
    />
  );
};
