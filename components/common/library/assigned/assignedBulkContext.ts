import { createContext, useContext, useLayoutEffect } from 'react';
import type { LucideIcon } from 'lucide-react';

/** One action in the Assigned tab's selection bar. */
export interface AssignedBulkAction {
  id: string;
  label: string;
  icon: LucideIcon;
  destructive?: boolean;
  /** Asked before running, e.g. for Delete. */
  confirm?: { title: string; message: string; confirmLabel: string };
  run: () => Promise<void> | void;
}

export interface AssignedRowSelect {
  selected: boolean;
  toggle: () => void;
}

/** Set by `AssignedList` around each row while the teacher is selecting. */
export const AssignedRowSelectContext = createContext<AssignedRowSelect | null>(
  null
);

export const useAssignedRowSelect = () => useContext(AssignedRowSelectContext);

/** Puts one row back; null where the write can't be undone. */
export type AssignedBulkUndo = (() => Promise<void>) | null;

/** What one row can do in a bulk action; each resolves to its own undo. */
export interface AssignedBulkOps {
  close?: () => Promise<AssignedBulkUndo>;
  moveToDone?: () => Promise<AssignedBulkUndo>;
}

type Register = (ops: AssignedBulkOps | null) => void;

/** Set by `AssignedList` around each row so the row can offer its bulk ops. */
export const AssignedBulkRegisterContext = createContext<Register | null>(null);

/** A row host hands its close and move-to-done writes to the selection bar. */
export function useAssignedBulkOps(ops: AssignedBulkOps): void {
  const register = useContext(AssignedBulkRegisterContext);
  // Registers after every render so the bar always runs the row's latest writes.
  useLayoutEffect(() => {
    register?.(ops);
    return () => register?.(null);
  });
}
