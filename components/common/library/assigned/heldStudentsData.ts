import { createContext, useContext } from 'react';
import type { HeldStudent } from '@/utils/assignedStatus';
import {
  useAssignmentPseudonymsMulti,
  type StudentName,
} from '@/hooks/useAssignmentPseudonyms';
import { useAuth } from '@/context/useAuth';
import { formatStudentTime } from '@/components/widgets/QuizWidget/components/monitor/studentTimeFormat';
import { UNKNOWN_STUDENT_LABEL } from '@/components/widgets/QuizWidget/utils/resolveDisplayName';
import { compareLastFirst, lastFirst } from '@/utils/studentName';

/** The line a held student's time reads as: their scheduled window, or a Let in running now. */
export function heldTimeText(s: Pick<HeldStudent, 'from' | 'until'>): string {
  if (s.from != null)
    return formatStudentTime({ from: s.from, until: s.until });
  const until = new Date(s.until).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `Let in until ${until}`;
}

/** Held students as "Last, First" with their time, sorted by last name. */
export function heldRows(
  students: readonly HeldStudent[],
  names: ReadonlyMap<string, StudentName> | null
): { uid: string; name: string; time: string }[] {
  return students
    .map((s) => ({ s, name: names?.get(s.uid) }))
    .sort((a, b) => compareLastFirst(a.name, b.name))
    .map(({ s, name }) => ({
      uid: s.uid,
      // A name still loading shows the live-list label.
      name: lastFirst(name) || UNKNOWN_STUDENT_LABEL,
      time: heldTimeText(s),
    }));
}

/** Dev harness names, standing in for the lookup. */
export const HeldNamesFixture = createContext<ReadonlyMap<
  string,
  StudentName
> | null>(null);

/** Resolves held students' names for a run outside the monitor; skips the lookup when nobody is held. */
export function useHeldStudentNames(
  assignmentId: string | null,
  classIds: readonly string[] | undefined,
  enabled: boolean
): ReadonlyMap<string, StudentName> | null {
  const fixture = useContext(HeldNamesFixture);
  const { orgId } = useAuth();
  const { byStudentUid, loading } = useAssignmentPseudonymsMulti(
    enabled && !fixture ? assignmentId : null,
    classIds ?? null,
    orgId
  );
  if (fixture) return fixture;
  return loading ? null : byStudentUid;
}
