import React, { useCallback, useMemo } from 'react';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import type { ClassDirectoryEntry } from '@/hooks/useStudentClassDirectory';
import { useStudentTurnIns } from '@/hooks/useStudentTurnIns';
import { useStudentGrades } from '@/hooks/useStudentGrades';
import { useServerNow } from '@/hooks/useServerNow';
import { useDialog } from '@/context/useDialog';
import { logError } from '@/utils/logError';
import { getClassColor } from '@/utils/studentClassColors';
import {
  classIdsInSession,
  type ScheduleLookup,
} from '@/utils/studentClassOrder';
import {
  partitionLanding,
  periodLabel,
  periodSquare,
  type DoneItem,
} from '@/utils/studentLanding';
import { readStudentResponseDoc } from '@/utils/studentResponseDoc';
import { resolveStudentOpenHref } from '@/utils/studentOpenHref';
import { StudentLandingLayout } from './StudentLandingLayout';
import type { LandingClass, LandingTab } from './types';

interface StudentLandingV2Props {
  /** Bell-ordered, roster-matched classes. */
  classes: ClassDirectoryEntry[];
  scheduleFor: ScheduleLookup;
  assignments: AssignmentSummary[];
  pseudonymUid: string | null;
  firstName: string | null;
  selectedClassId: string | null;
  onSelectClass: (classId: string | null) => void;
  tab: LandingTab;
  onTabChange: (tab: LandingTab) => void;
  gradesEnabled: boolean;
  onSignOut: () => void;
  notice?: React.ReactNode;
}

const LOCKED_MESSAGE =
  'Locked by your teacher. Ask them to unlock your results.';

/** STUDENT_LANDING_V2 PR 4: the `student-landing-v2` student page. */
export const StudentLandingV2: React.FC<StudentLandingV2Props> = ({
  classes,
  scheduleFor,
  assignments,
  pseudonymUid,
  firstName,
  selectedClassId,
  onSelectClass,
  tab,
  onTabChange,
  gradesEnabled,
  onSignOut,
  notice,
}) => {
  const nowMs = useServerNow(60_000);
  const { checks, recheck } = useStudentTurnIns(assignments, pseudonymUid);
  const { showAlert } = useDialog();
  const gradesOn = gradesEnabled && !!pseudonymUid;
  const grades = useStudentGrades(pseudonymUid, selectedClassId, gradesOn);

  const landingClasses = useMemo<LandingClass[]>(
    () =>
      classes.map((c) => ({
        classId: c.classId,
        name: c.name,
        teachers: c.teacherDisplayName,
        square: periodSquare(c.name, c.bellPeriod),
        periodLabel: periodLabel(c.bellPeriod, scheduleFor),
        color: getClassColor(c.classId),
      })),
    [classes, scheduleFor]
  );
  const partition = useMemo(
    () => partitionLanding(assignments, checks, nowMs),
    [assignments, checks, nowMs]
  );
  const inSessionIds = useMemo(
    () => new Set(classIdsInSession(classes, scheduleFor, nowMs)),
    [classes, scheduleFor, nowMs]
  );
  // The row's lock came from a one-time read; re-read so a teacher's unlock opens straight away.
  const onLockedClick = useCallback(
    (a: AssignmentSummary) => {
      if (!pseudonymUid) return;
      readStudentResponseDoc(a, pseudonymUid)
        .then((data) => {
          if (data?.resultsLockedOut === true) {
            void showAlert(LOCKED_MESSAGE, {
              title: 'Results locked',
              variant: 'warning',
            });
            return;
          }
          void recheck(a);
          window.location.assign(a.openHref);
        })
        .catch((err: unknown) => {
          logError('StudentLandingV2.recheckLock', err, {
            sessionId: a.sessionId,
            kind: a.kind,
          });
          void showAlert(
            'Could not check your results. Check your connection and try again.',
            { title: 'Connection issue', variant: 'warning' }
          );
        });
    },
    [pseudonymUid, recheck, showAlert]
  );

  const onOpenGradeOnly = useCallback(
    (item: DoneItem) => {
      resolveStudentOpenHref(item.kind, item.sessionId)
        .then((href) => window.location.assign(href))
        .catch((err: unknown) => {
          logError('StudentLandingV2.openGradeOnly', err, {
            sessionId: item.sessionId,
            kind: item.kind,
          });
          void showAlert(
            'Could not open this. Check your connection and try again.',
            { title: 'Connection issue', variant: 'warning' }
          );
        });
    },
    [showAlert]
  );

  return (
    <StudentLandingLayout
      classes={landingClasses}
      partition={partition}
      checks={checks}
      inSessionIds={inSessionIds}
      nowMs={nowMs}
      selectedClassId={selectedClassId}
      onSelectClass={onSelectClass}
      tab={tab}
      onTabChange={onTabChange}
      gradesEnabled={gradesOn}
      grades={gradesOn ? grades : undefined}
      firstName={firstName}
      pseudonymUid={pseudonymUid}
      onSignOut={onSignOut}
      onLockedClick={onLockedClick}
      onOpenGradeOnly={onOpenGradeOnly}
      notice={notice}
    />
  );
};
