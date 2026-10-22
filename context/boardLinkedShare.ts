import { createContext, use } from 'react';
import { useActiveBoardLinkedShareId } from '@/context/dashboardCanvasStore';

/** The live share of the board a widget sits on (hidden mounted boards included); undefined outside a BoardCanvas. */
export const BoardLinkedShareContext = createContext<string | null | undefined>(
  undefined
);

/** This widget's own board's Synced/View-Only share id, or null; falls back to the active board outside a BoardCanvas. */
export function useBoardLinkedShareId(): string | null {
  const own = use(BoardLinkedShareContext);
  const active = useActiveBoardLinkedShareId();
  return own === undefined ? active : own;
}
