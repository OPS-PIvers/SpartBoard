// Shell actions the Data overview can trigger; the team shell (B1) provides them, and missing ones hide their control.

import { createContext, useContext } from 'react';

export interface TeamShellActions {
  /** Opens the layout editor at the hero picker. */
  openLayoutEditor?: () => void;
  /** Opens the header's My items drawer. */
  openMyItems?: () => void;
}

export const TeamShellActionsContext = createContext<TeamShellActions>({});

export function useTeamShellActions(): TeamShellActions {
  return useContext(TeamShellActionsContext);
}
