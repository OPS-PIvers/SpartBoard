import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContextValue';

/** Whether this teacher gets the shared image picker; false outside the signed-in app. */
export const useUnifiedImagePicker = (): boolean =>
  useContext(AuthContext)?.canAccessFeature('unified-image-picker') ?? false;
