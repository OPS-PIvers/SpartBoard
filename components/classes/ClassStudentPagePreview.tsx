import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Loader2, X } from 'lucide-react';
import type { ClassRoster } from '@/types';
import { Z_INDEX } from '@/config/zIndex';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useServerNow } from '@/hooks/useServerNow';
import { useStudentBellSchedules } from '@/hooks/useStudentBellSchedules';
import { useProjectsWidgetSettings } from '@/hooks/useProjectsWidgetSettings';
import {
  useClassStudentPagePreview,
  type ClassPreviewStatus,
} from '@/hooks/useClassStudentPagePreview';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import type { TurnInMap } from '@/hooks/useStudentTurnIns';
import { StudentLandingLayout } from '@/components/student/landing/StudentLandingLayout';
import type {
  LandingClass,
  LandingTab,
} from '@/components/student/landing/types';
import { getClassColor } from '@/utils/studentClassColors';
import { classIdsInSession } from '@/utils/studentClassOrder';
import {
  partitionLanding,
  periodLabel,
  periodSquare,
  type DoneItem,
} from '@/utils/studentLanding';
import { loadAssignedStudentView } from '@/utils/quizAssignedStudentViewLoad';
import type { AssignedStudentView } from '@/utils/quizStudentViewSession';
import { logError } from '@/utils/logError';
import { studentPageClassId } from '@/utils/studentPageClassId';

const QuizStudentView = lazy(() =>
  import('@/components/quiz/QuizStudentView').then((m) => ({
    default: m.QuizStudentView,
  }))
);

const NO_CHECKS: TurnInMap = {};

interface ClassStudentPagePreviewProps {
  roster: ClassRoster;
  onClose: () => void;
}

/** My Classes "View Student Page": the class's /my-assignments page from the teacher's own sessions; nothing is written. */
export const ClassStudentPagePreview: React.FC<
  ClassStudentPagePreviewProps
> = ({ roster, onClose }) => {
  const { user, canAccessFeature } = useAuth();
  const { enabled: projectsEnabled } = useProjectsWidgetSettings();
  const { status, assignments } = useClassStudentPagePreview(
    user?.uid,
    studentPageClassId(roster) ?? '',
    projectsEnabled
  );
  return (
    <ClassStudentPageView
      roster={roster}
      teacherName={user?.displayName ?? ''}
      status={status}
      assignments={assignments}
      quizViewOn={canAccessFeature('quiz-student-view')}
      tabAwayTimerOn={canAccessFeature('tab-away-timer')}
      onClose={onClose}
    />
  );
};

interface ClassStudentPageViewProps {
  roster: ClassRoster;
  teacherName: string;
  status: ClassPreviewStatus;
  assignments: AssignmentSummary[];
  quizViewOn: boolean;
  tabAwayTimerOn: boolean;
  onClose: () => void;
}

/** The preview's page; data comes from the container, or fixtures on /class-student-page-dev. */
export const ClassStudentPageView: React.FC<ClassStudentPageViewProps> = ({
  roster,
  teacherName,
  status,
  assignments,
  quizViewOn,
  tabAwayTimerOn,
  onClose,
}) => {
  const { showAlert } = useDialog();
  const classId = studentPageClassId(roster) ?? '';
  const bell = useStudentBellSchedules(true);
  const nowMs = useServerNow(60_000);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(
    classId
  );
  const [tab, setTab] = useState<LandingTab>('assignments');
  const [quizView, setQuizView] = useState<AssignedStudentView | null>(null);
  const [opening, setOpening] = useState(false);

  const quizOpen = quizView !== null;
  useEffect(() => {
    if (quizOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quizOpen, onClose]);

  const bellPeriod = roster.bellPeriod ?? undefined;
  const classes = useMemo<LandingClass[]>(
    () => [
      {
        classId,
        name: roster.name,
        teachers: teacherName,
        square: periodSquare(roster.name, bellPeriod),
        periodLabel: periodLabel(bellPeriod, bell.scheduleFor),
        color: getClassColor(classId),
      },
    ],
    [classId, roster.name, teacherName, bellPeriod, bell.scheduleFor]
  );
  const partition = useMemo(
    () => partitionLanding(assignments, NO_CHECKS, nowMs),
    [assignments, nowMs]
  );
  const inSessionIds = useMemo(
    () =>
      new Set(
        classIdsInSession(
          [{ classId, name: roster.name, bellPeriod }],
          bell.scheduleFor,
          nowMs
        )
      ),
    [classId, roster.name, bellPeriod, bell.scheduleFor, nowMs]
  );

  const open = (kind: AssignmentSummary['kind'], sessionId: string) => {
    if (kind !== 'quiz' || !quizViewOn) {
      void showAlert('Only quizzes open from this preview.', {
        title: 'Student page',
        variant: 'info',
      });
      return;
    }
    if (opening) return;
    setOpening(true);
    loadAssignedStudentView(sessionId)
      .then((view) => {
        if (view) setQuizView(view);
        else
          void showAlert('This quiz could not be found.', {
            title: 'Student page',
            variant: 'warning',
          });
      })
      .catch((err: unknown) => {
        logError('ClassStudentPagePreview.openQuiz', err, { sessionId });
        void showAlert('Could not open this quiz.', {
          title: 'Student page',
          variant: 'warning',
        });
      })
      .finally(() => setOpening(false));
  };

  // Every row link is the student's real player; the preview swaps it for the teacher's read-only view.
  const interceptLink = (e: React.MouseEvent<HTMLDivElement>) => {
    const link = (e.target as Element).closest('a[href]');
    if (!link) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type !== 'click') return;
    const href = link.getAttribute('href');
    const row = assignments.find((a) => a.openHref === href);
    if (row) {
      open(row.kind, row.sessionId);
      return;
    }
    void showAlert('Only quizzes open from this preview.', {
      title: 'Student page',
      variant: 'info',
    });
  };

  const onOpenGradeOnly = (item: DoneItem) => open(item.kind, item.sessionId);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Student page for ${roster.name}`}
      className="fixed inset-0 flex flex-col bg-white"
      style={{ zIndex: Z_INDEX.modal }}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 bg-slate-900 px-3 text-xs text-slate-300">
        <div className="flex min-w-0 items-center gap-1.5 font-bold text-white">
          <Eye className="h-4 w-4 shrink-0" aria-hidden />
          <span className="shrink-0">Student page</span>
          <span className="truncate font-normal text-slate-300">
            {roster.name}
          </span>
        </div>
        {opening && (
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin text-slate-300"
            aria-label="Opening"
          />
        )}
        <button
          type="button"
          onClick={onClose}
          // no-tour-anchor: exits a full-screen preview a tour never opens on its own
          className="ml-auto flex shrink-0 items-center gap-1 rounded-md bg-white px-2.5 py-1 font-bold text-slate-900 hover:bg-slate-100"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Exit
        </button>
      </div>
      <div
        className="min-h-0 flex-1"
        onClickCapture={interceptLink}
        onAuxClickCapture={interceptLink}
      >
        {status === 'loading' ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-50 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-brand-blue-primary" />
          </div>
        ) : (
          <StudentLandingLayout
            embedded
            classes={classes}
            partition={partition}
            checks={NO_CHECKS}
            inSessionIds={inSessionIds}
            nowMs={nowMs}
            selectedClassId={selectedClassId}
            onSelectClass={setSelectedClassId}
            tab={tab}
            onTabChange={setTab}
            gradesEnabled={false}
            firstName={null}
            pseudonymUid={null}
            onSignOut={onClose}
            onLockedClick={(a) => open(a.kind, a.sessionId)}
            onOpenGradeOnly={onOpenGradeOnly}
            notice={
              status === 'error' ? (
                <p
                  role="alert"
                  className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
                >
                  Could not load this class&apos;s work.
                </p>
              ) : undefined
            }
          />
        )}
      </div>
      {quizView && (
        <Suspense fallback={null}>
          <QuizStudentView
            assigned={quizView}
            tabAwayTimerOn={tabAwayTimerOn}
            onExit={() => setQuizView(null)}
          />
        </Suspense>
      )}
    </div>,
    document.body
  );
};
