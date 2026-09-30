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
  onOpenResults?: (column: GradebookColumnRef) => void;
  onAnalyze?: (column: GradebookColumnRef) => void;
  onSortByColumn?: (column: GradebookColumnRef) => void;
  onPublishColumn?: (
    column: GradebookColumnRef,
    action: 'publish' | 'unpublish'
  ) => void;
}

export const GradebookHeaderPopover: React.FC<
  GradebookHeaderPopoverProps
> = () => null;
