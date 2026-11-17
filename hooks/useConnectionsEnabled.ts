import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import { useSubShareHost } from '@/context/SubShareHostContextValue';

// Connections run on the teacher's board; the sub portal (no runner), tests and harness pages keep the old toggles.
export const useConnectionsEnabled = (): boolean => {
  const sub = useSubShareHost();
  return useContext(AuthContext) !== undefined && sub === null;
};
