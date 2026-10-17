import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertCircle, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useStudentAuth } from '@/context/useStudentAuth';
import { useStudentAssignments } from '@/hooks/useStudentAssignments';
import { useStudentClassDirectory } from '@/hooks/useStudentClassDirectory';
import { useStudentBellSchedules } from '@/hooks/useStudentBellSchedules';
import {
  pickClassInSession,
  sortClassesByBell,
} from '@/utils/studentClassOrder';
import { useProjectsWidgetSettings } from '@/hooks/useProjectsWidgetSettings';
import { getServerNow, syncServerTime } from '@/utils/serverTime';
import { StudentPageShell } from './StudentPageShell';
import { useStudentGradebookEnabled } from '@/hooks/useStudentGrades';
import {
  myAssignmentsPath,
  parseMyAssignmentsPath,
  type StudentClassTab,
} from '@/utils/myAssignmentsPath';
import { StudentLandingV2 } from './landing/StudentLandingV2';
import type { LandingTab } from './landing/types';

// /my-assignments: the student's class list, Up next and per-class pages.

const REFOCUS_RESELECT_MS = 10 * 60 * 1000;

const MyAssignmentsPage: React.FC = () => {
  const { classIds, pseudonymUid, firstName, signOut, pinLogin } =
    useStudentAuth();

  const directory = useStudentClassDirectory({ classIds, pseudonymUid });
  const bell = useStudentBellSchedules(true);
  const classes = useMemo(
    () => sortClassesByBell(directory.classes, bell.scheduleFor),
    [directory.classes, bell.scheduleFor]
  );
  const {
    loadState,
    assignments: allAssignments,
    hasErrors,
    hasClassErrors,
    retry,
  } = useStudentAssignments({
    classIds,
    studentUid: pseudonymUid,
    pinLogin,
  });

  // The Projects rollout switch is the kill switch: with it off, an existing
  // run must stop being listed here, not just stop being created. The query
  // still runs — SESSION_KINDS is static — but a dead row never shows.
  const { enabled: projectsEnabled } = useProjectsWidgetSettings();
  const assignments = useMemo(
    () =>
      projectsEnabled
        ? allAssignments
        : allAssignments.filter((row) => row.kind !== 'projects'),
    [allAssignments, projectsEnabled]
  );

  // M17 C2 — clock-skew guard for window enforcement (spec §3a-D): window
  // comparisons use server-offset time, never raw Date.now().
  useEffect(() => {
    syncServerTime(pseudonymUid);
  }, [pseudonymUid]);

  // Rules deny grade reads to a PIN sign-in token.
  const gradesEnabled = useStudentGradebookEnabled() && !pinLogin;
  const [initialPath] = useState(() =>
    typeof window === 'undefined'
      ? parseMyAssignmentsPath('')
      : parseMyAssignmentsPath(window.location.pathname)
  );

  // Active class selection — null = "All classes" overview.
  const [activeClassId, setActiveClassId] = useState<string | null>(
    initialPath.classId
  );
  const [landingTab, setLandingTab] = useState<LandingTab>(
    initialPath.tab === 'grades' ? 'completed' : 'assignments'
  );

  // A class from the URL or a tap is the student's pick; auto-select never overrides it.
  const [picked, setPicked] = useState(initialPath.classId !== null);
  const [autoSelectDone, setAutoSelectDone] = useState(false);
  const autoSelectReady =
    directory.status === 'ready' && bell.status !== 'loading';
  if (autoSelectReady && !autoSelectDone) {
    setAutoSelectDone(true);
    if (!picked) {
      setActiveClassId(
        pickClassInSession(classes, bell.scheduleFor, getServerNow())
      );
    }
  }
  const hiddenAtRef = useRef<number | null>(null);
  const reselectOnRefocus = !picked;
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (!reselectOnRefocus || hiddenAt === null) return;
      if (Date.now() - hiddenAt <= REFOCUS_RESELECT_MS) return;
      setActiveClassId(
        pickClassInSession(classes, bell.scheduleFor, getServerNow())
      );
      setLandingTab('assignments');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [reselectOnRefocus, classes, bell.scheduleFor]);
  const syncPath = useCallback(
    (classId: string | null, tab: StudentClassTab) => {
      if (!gradesEnabled || typeof window === 'undefined') return;
      window.history.replaceState(null, '', myAssignmentsPath(classId, tab));
    },
    [gradesEnabled]
  );
  const handleLandingTabChange = useCallback(
    (tab: LandingTab) => {
      setLandingTab(tab);
      syncPath(activeClassId, tab === 'completed' ? 'grades' : 'assignments');
    },
    [activeClassId, syncPath]
  );
  const handleSelectClass = useCallback(
    (classId: string | null) => {
      setPicked(true);
      setActiveClassId(classId);
      setLandingTab('assignments');
      syncPath(classId, 'assignments');
    },
    [syncPath]
  );

  // A selected class that vanished from the student's claims falls back to the overview.
  const effectiveClassId =
    activeClassId && classIds.includes(activeClassId)
      ? (directory.byId[activeClassId]?.classId ?? null)
      : null;

  const handleDone = useCallback(() => {
    void signOut();
  }, [signOut]);

  // ────────── Loading / no-classes / error gates (top-level guards) ──────────
  if (
    loadState === 'loading' ||
    directory.status === 'loading' ||
    bell.status === 'loading'
  ) {
    return (
      <StudentPageShell onDone={handleDone}>
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-brand-blue-primary" />
          <p className="text-sm font-medium">Loading your assignments…</p>
        </div>
      </StudentPageShell>
    );
  }

  if (directory.status === 'error') {
    return (
      <StudentPageShell onDone={handleDone}>
        <FullEmpty
          icon={AlertTriangle}
          title="We couldn't load your classes"
          body="Check your connection and try again."
          tone="error"
          action={{ label: 'Retry', onClick: directory.retry }}
        />
      </StudentPageShell>
    );
  }

  if (classIds.length === 0 || directory.classes.length === 0) {
    return (
      <StudentPageShell onDone={handleDone}>
        <FullEmpty
          icon={AlertCircle}
          title="You're not on a roster yet"
          body="If you just started at your school, ask a teacher to sync their roster."
        />
      </StudentPageShell>
    );
  }

  if (assignments.length === 0 && hasClassErrors) {
    return (
      <StudentPageShell onDone={handleDone}>
        <FullEmpty
          icon={AlertTriangle}
          title="We couldn't load your assignments"
          body="Something went wrong loading your assignments. Refresh and try again."
          tone="error"
          action={{ label: 'Try again', onClick: retry }}
        />
      </StudentPageShell>
    );
  }

  return (
    <StudentLandingV2
      classes={classes}
      scheduleFor={bell.scheduleFor}
      assignments={assignments}
      pseudonymUid={pseudonymUid}
      firstName={firstName}
      selectedClassId={effectiveClassId}
      onSelectClass={handleSelectClass}
      tab={landingTab}
      onTabChange={handleLandingTabChange}
      gradesEnabled={gradesEnabled}
      onSignOut={handleDone}
      notice={
        hasErrors ? (
          <PartialFailureBanner onRetry={retry} className="mb-4" />
        ) : undefined
      }
    />
  );
};

// ---------------------------------------------------------------------------
// Partial-failure banner
// ---------------------------------------------------------------------------

const PartialFailureBanner: React.FC<{
  onRetry: () => void;
  className?: string;
}> = ({ onRetry, className }) => (
  <div
    role="alert"
    className={`flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm shadow-sm ${className ?? ''}`}
  >
    <AlertTriangle
      className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
      strokeWidth={2.25}
      aria-hidden="true"
    />
    <div className="min-w-0 flex-1">
      <p className="font-semibold text-amber-900">
        Some assignments couldn&apos;t be loaded.
      </p>
      <p className="text-amber-800/90">
        You&apos;re seeing what we could fetch. Try again to load the rest.
      </p>
    </div>
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-50"
    >
      <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.5} />
      Try again
    </button>
  </div>
);

// ---------------------------------------------------------------------------
// Full-page empty state (used for no-classes / hard error gates)
// ---------------------------------------------------------------------------

interface FullEmptyProps {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  body: string;
  tone?: 'soft' | 'error';
  action?: { label: string; onClick: () => void };
}

const FullEmpty: React.FC<FullEmptyProps> = ({
  icon: Icon,
  title,
  body,
  tone = 'soft',
  action,
}) => {
  const isSoft = tone === 'soft';
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
          isSoft ? 'bg-slate-100' : 'bg-brand-red-primary/10'
        }`}
      >
        <Icon
          className={`h-7 w-7 ${isSoft ? 'text-slate-400' : 'text-brand-red-primary'}`}
          strokeWidth={2}
        />
      </div>
      <div className="max-w-sm space-y-1.5">
        <h3 className="text-base font-bold text-slate-800">{title}</h3>
        <p className="text-sm leading-relaxed text-slate-500">{body}</p>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-blue-primary/20 transition hover:bg-brand-blue-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
        >
          <RefreshCw className="h-4 w-4" strokeWidth={2.25} />
          {action.label}
        </button>
      )}
    </div>
  );
};

export default MyAssignmentsPage;
export { MyAssignmentsPage };
