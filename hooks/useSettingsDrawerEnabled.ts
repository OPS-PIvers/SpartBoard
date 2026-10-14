import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContextValue';

// Trees without an auth context keep the note's own style controls.
export function useSettingsDrawerEnabled(): boolean {
  return useContext(AuthContext) !== undefined;
}
