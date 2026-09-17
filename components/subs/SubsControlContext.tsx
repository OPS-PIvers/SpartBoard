/**
 * SubsControlContext — surfaces sub-specific board controls (currently just
 * `resetWidgets`) to consumers inside SubBoardScreen. Kept separate from
 * DashboardContext because "reset board to host's snapshot" is a sub-only
 * verb and would have no meaning on the teacher side.
 */

import { createContext, useContext } from 'react';
import type { SubRosterStatus } from '@/hooks/useSubstituteRosters';

export interface SubsControlContextValue {
  /**
   * Restore every widget on the board to its state at share-creation time
   * (the immutable `initialState` snapshot on the share doc) AND re-mount
   * every widget so any component-local state (timer running flags,
   * playback state, transient UI) is thrown away too.
   */
  resetWidgets: () => void;
  rosterStatus: SubRosterStatus;
  /** Opens the Google Picker on the shared roster files, then loads them. */
  loadRosters: () => Promise<void>;
}

export const SubsControlContext = createContext<SubsControlContextValue | null>(
  null
);

export function useSubsControl(): SubsControlContextValue {
  const ctx = useContext(SubsControlContext);
  if (!ctx) {
    throw new Error(
      'useSubsControl must be used inside <SubsDashboardProvider />'
    );
  }
  return ctx;
}
