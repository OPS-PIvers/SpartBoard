export type StudentKpiCategory = 'monthlyStudents' | 'dailyStudents';

export interface ActiveStudentRow {
  name: string;
  teachers: string[];
  lastSignInMs: number;
}

export interface ActiveStudentsResponse {
  asOf: number;
  partial: boolean;
  students: ActiveStudentRow[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Rows for one KPI: the daily list is the monthly list narrowed to the last 24 hours. */
export function studentsForCategory(
  rows: readonly ActiveStudentRow[],
  category: StudentKpiCategory,
  asOf: number
): ActiveStudentRow[] {
  return category === 'dailyStudents'
    ? rows.filter((r) => asOf - r.lastSignInMs <= DAY_MS)
    : [...rows];
}
