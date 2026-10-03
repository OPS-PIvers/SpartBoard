import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContextValue';

/** Sparty shows only with the `sparty` feature and the teacher's own switch on; safe outside AuthProvider. */
export const useShowSparty = (): boolean => {
  const auth = useContext(AuthContext);
  return !!auth && auth.spartyEnabled && auth.canAccessFeature('sparty');
};
