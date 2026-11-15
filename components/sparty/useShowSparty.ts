import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContextValue';

/** Sparty shows when the teacher's own switch is on; safe outside AuthProvider. */
export const useShowSparty = (): boolean => {
  const auth = useContext(AuthContext);
  return !!auth && auth.spartyEnabled;
};
