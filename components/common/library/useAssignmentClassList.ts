import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContextValue';

/** True when the assignment-class-list flag is on; false without an auth provider. */
export const useAssignmentClassList = (): boolean =>
  useContext(AuthContext)?.canAccessFeature?.('assignment-class-list') === true;
