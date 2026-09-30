import type React from 'react';
import type {
  GradebookCellData,
  GradebookColumnRef,
  GradebookPopoverContext,
} from '../slotTypes';

// Slot stub: the popover slice replaces this with `popovers/GradebookHeaderPopover`.
export interface GradebookHeaderPopoverProps {
  anchor: HTMLElement;
  ctx: GradebookPopoverContext;
  column: GradebookColumnRef;
  columnCells: GradebookCellData[];
  onClose: () => void;
  onNotify?: (message: string, undo?: () => void) => void;
  sortedByColumn?: boolean;
  onEditAssignment?: (column: GradebookColumnRef) => void;
  onDeleteAssignment?: (column: GradebookColumnRef) => void;
  onOpenResults?: (column: GradebookColumnRef) => void;
  onAnalyze?: (column: GradebookColumnRef) => void;
  onSortByColumn?: (column: GradebookColumnRef) => void;
  onPublishColumn?: (
    column: GradebookColumnRef,
    action: 'publish' | 'unpublish'
  ) => void;
  /** Fourth action in the header row: the LMS Push button (W3-F). */
  pushControl?: React.ReactNode;
}

export const GradebookHeaderPopover: React.FC<
  GradebookHeaderPopoverProps
> = () => null;
