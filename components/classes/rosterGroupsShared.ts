import type { Student } from '@/types';

export const lastFirst = (s: Student) =>
  [s.lastName.trim(), s.firstName.trim()].filter(Boolean).join(', ') || s.id;

export const sortByLastName = (students: Student[]) =>
  [...students].sort((a, b) => lastFirst(a).localeCompare(lastFirst(b)));

export const ROW_BUTTON =
  'shrink-0 flex items-center gap-1.5 min-h-9 px-3 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors';
