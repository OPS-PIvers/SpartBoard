/**
 * LibraryGridLockContext — channel by which `LibraryGrid` communicates its
 * drag/reorder lock state down to each `LibraryItemCard` it renders.
 *
 * Consumers never read this context directly; it's an internal primitive
 * of the library surface. Separated from `LibraryItemCard` for react-refresh
 * (fast refresh only works when a file exports components-only).
 */

import { createContext } from 'react';

export interface LibraryGridLockState {
  locked: boolean;
  reason?: string;
  /** When true, hides drag handles outright (grid-level `dragDisabled`). */
  dragDisabled: boolean;
}

export const LibraryGridLockContext = createContext<LibraryGridLockState>({
  locked: false,
  dragDisabled: false,
});
