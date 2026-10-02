import React, { useCallback, useMemo } from 'react';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import type { ClassDirectoryEntry } from '@/hooks/useStudentClassDirectory';
import { useStudentTurnIns } from '@/hooks/useStudentTurnIns';
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
} from '@/utils/studentLanding';
import { readStudentResponseDoc } from '@/utils/studentResponseDoc';
import { StudentLandingLayout } from './StudentLandingLayout';
import { LandingGradebook } from './LandingGradebook';
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
  const hrefBySession = useMemo(() => {
    const out: Record<string, string> = {};
    for (const a of assignments) out[a.sessionId] = a.openHref;
    return out;
  }, [assignments]);

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
      gradesEnabled={gradesEnabled && !!pseudonymUid}
      renderGradebook={(classId) =>
        pseudonymUid ? (
          <LandingGradebook
            key={classId}
            studentUid={pseudonymUid}
            classId={classId}
            hrefBySession={hrefBySession}
          />
        ) : null
      }
      firstName={firstName}
      pseudonymUid={pseudonymUid}
      onSignOut={onSignOut}
      onLockedClick={onLockedClick}
      notice={notice}
    />
  );
};
