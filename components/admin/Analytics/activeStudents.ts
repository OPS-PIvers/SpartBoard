export type StudentKpiCategory = 'monthlyStudents' | 'dailyStudents';

export interface ActiveStudentRow {
  name: string;
  // Teachers whose assignments the student opened, with the latest open.
  teachers: { name: string; lastOpenedMs: number }[];
  lastSignInMs: number;
}

export interface ActiveStudentsResponse {
  asOf: number;
  partial: boolean;
  students: ActiveStudentRow[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StudentListRow {
  name: string;
  teachers: string[];
  lastSignInMs: number;
}

/** Rows for one KPI: the daily list keeps sign-ins and assignment opens from the last 24 hours. */
export function studentsForCategory(
  rows: readonly ActiveStudentRow[],
  category: StudentKpiCategory,
  asOf: number
): StudentListRow[] {
  const daily = category === 'dailyStudents';
  return rows
    .filter((r) => !daily || asOf - r.lastSignInMs <= DAY_MS)
    .map((r) => ({
      name: r.name,
      lastSignInMs: r.lastSignInMs,
      teachers: r.teachers
        .filter((t) => !daily || asOf - t.lastOpenedMs <= DAY_MS)
        .map((t) => t.name),
    }));
}
