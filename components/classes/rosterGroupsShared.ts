import type { Student } from '@/types';
import { compareLastFirst, lastFirstOrUnnamed } from '@/utils/studentName';

export const lastFirst = lastFirstOrUnnamed;

export const sortByLastName = (students: Student[]) =>
  [...students].sort(compareLastFirst);

export const ROW_BUTTON =
  'shrink-0 flex items-center gap-1.5 min-h-9 px-3 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors';
