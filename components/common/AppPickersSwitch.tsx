import { useEffect } from 'react';
import { switchAppPickers } from '@/utils/appPickers';
import type { GlobalFeature } from '@/types';

/** Mounted inside the teacher auth provider: the app's own pickers run only while the app-pickers flag is on. */
export const AppPickersSwitch: React.FC<{
  canAccessFeature: (featureId: GlobalFeature) => boolean;
  isStudentRole: boolean;
}> = ({ canAccessFeature, isStudentRole }) => {
  const on = !isStudentRole && canAccessFeature('app-pickers');
  useEffect(() => {
    switchAppPickers(on);
    return () => switchAppPickers(false);
  }, [on]);
  return null;
};
