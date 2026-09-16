import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContextValue';

// Provider-optional flag read: student, remote and test trees without AuthProvider get the legacy surface.
export function useSettingsDrawerEnabled(): boolean {
  const auth = useContext(AuthContext);
  return auth?.canAccessFeature('settings-drawer') ?? false;
}
