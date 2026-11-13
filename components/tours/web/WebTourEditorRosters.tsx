import React, { useMemo } from 'react';
import { DashboardContext } from '@/context/DashboardContextValue';
import { useAuth } from '@/context/useAuth';
import { useRosters } from '@/hooks/useRosters';

/** Gives the Web tour editor the admin's rosters off the board, so its student-name checks still run. */
export const WebTourEditorRosters: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const { rosters } = useRosters(user);
  const value = useMemo(
    // Only `rosters` is read by the editor tree on this route.
    () =>
      ({ rosters }) as unknown as React.ContextType<typeof DashboardContext>,
    [rosters]
  );
  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
};
