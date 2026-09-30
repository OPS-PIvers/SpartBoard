import type React from 'react';
import type {
  GradebookCellData,
  GradebookColumnRef,
  GradebookPopoverContext,
} from '../slotTypes';

// Slot stub: the popover slice replaces this with `popovers/GradebookCellPopover`.
export interface GradebookCellPopoverProps {
  anchor: HTMLElement;
  ctx: GradebookPopoverContext;
  column: GradebookColumnRef;
  cell: GradebookCellData;
  columnCells: GradebookCellData[];
  prefill?: string;
  onClose: (reason?: 'enter') => void;
  onNotify?: (message: string, undo?: () => void) => void;
  onOpenGrader?: (sessionId: string, studentUid: string) => void;
}

export const GradebookCellPopover: React.FC<GradebookCellPopoverProps> = () =>
  null;
