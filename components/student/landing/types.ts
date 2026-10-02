import type { ClassColor } from '@/utils/studentClassColors';

/** One class as the landing page draws it (STUDENT_LANDING_V2 D20, D21). */
export interface LandingClass {
  classId: string;
  name: string;
  /** Every teacher joined with " & ". */
  teachers: string;
  /** Period number for the class-colour square, else the name's first letter (D5). */
  square: string;
  /** The schedule's name for the period, e.g. "3rd Period"; absent without a bell period. */
  periodLabel?: string;
  color: ClassColor;
}

export type LandingTab = 'assignments' | 'resources' | 'completed';
