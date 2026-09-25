import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContextValue';

/** True when the signed-in user may use the full-screen toggle on large modals. */
export const useModalFullscreenEnabled = (): boolean =>
  useContext(AuthContext)?.canAccessFeature('modal-fullscreen') ?? false;
