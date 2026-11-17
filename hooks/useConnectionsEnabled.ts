import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContextValue';

// Connections run wherever the teacher app runs; hosts without AuthProvider (tests, harness pages) keep the old toggles.
export const useConnectionsEnabled = (): boolean =>
  useContext(AuthContext) !== undefined;
