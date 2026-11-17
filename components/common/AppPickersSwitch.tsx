import { useEffect } from 'react';
import { switchAppPickers } from '@/utils/appPickers';

/** Mounted inside the teacher auth provider: the app's own pickers run for everyone but students. */
export const AppPickersSwitch: React.FC<{ isStudentRole: boolean }> = ({
  isStudentRole,
}) => {
  const on = !isStudentRole;
  useEffect(() => {
    switchAppPickers(on);
    return () => switchAppPickers(false);
  }, [on]);
  return null;
};
