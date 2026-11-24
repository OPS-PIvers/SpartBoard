import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContextValue';

/** Picked-student names on assignment rows, behind their preview flag. */
export const useShowPickedStudents = (): boolean =>
  useContext(AuthContext)?.canAccessFeature('picked-student-names') ?? false;
