import { createContext, use } from 'react';
import {
  useActiveBoardLinkedShareHostUid,
  useActiveBoardLinkedShareId,
} from '@/context/dashboardCanvasStore';

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

/** The host uid recorded when the widget's board joined its share; undefined outside a BoardCanvas. */
export const BoardLinkedShareHostContext = createContext<
  string | null | undefined
>(undefined);

/** This widget's own board's recorded share host, or null for boards joined before it was recorded. */
export function useBoardLinkedShareHostUid(): string | null {
  const own = use(BoardLinkedShareHostContext);
  const active = useActiveBoardLinkedShareHostUid();
  return own === undefined ? active : own;
}
