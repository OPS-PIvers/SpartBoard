import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContextValue';

// Widget Connections flag; hosts without AuthProvider (tests, harness pages) read it as off.
export const useConnectionsEnabled = (): boolean =>
  useContext(AuthContext)?.canAccessFeature('widget-connections') ?? false;
