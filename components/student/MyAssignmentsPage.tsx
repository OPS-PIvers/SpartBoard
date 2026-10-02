import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertCircle, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useStudentAuth } from '@/context/useStudentAuth';
import {
  isClosedProjectRun,
  useStudentAssignments,
  type AssignmentSummary,
} from '@/hooks/useStudentAssignments';
import { useStudentClassDirectory } from '@/hooks/useStudentClassDirectory';
import { useStudentLandingV2Enabled } from '@/hooks/useStudentLandingV2';
import { useStudentBellSchedules } from '@/hooks/useStudentBellSchedules';
import {
  pickClassInSession,
  sortClassesByBell,
} from '@/utils/studentClassOrder';
import { useProjectsWidgetSettings } from '@/hooks/useProjectsWidgetSettings';
import { getWindowState } from '@/utils/assignmentWindow';
import { getServerNow, syncServerTime } from '@/utils/serverTime';
import { StudentPageShell } from './StudentPageShell';
import { StudentSidebar } from './StudentSidebar';
import { StudentOverview } from './StudentOverview';
import { StudentClassView, type StudentClassTab } from './StudentClassView';
import { useStudentGradebookEnabled } from '@/hooks/useStudentGrades';
import {
  myAssignmentsPath,
  parseMyAssignmentsPath,
} from '@/utils/myAssignmentsPath';
import { type AssignmentFilterMode } from './AssignmentFilterTabs';
import type { CompletionState } from './AssignmentListItem';

/**
 * /my-assignments — class-aware student dashboard.
 *
 * Layout: a slide-out sidebar (class list) toggled by a hamburger button in
 * the page header, plus a main column (overview or per-class view). The
 * sidebar opens by default on desktop, closed by default on mobile, where
 * it presents as a slide-over with a tap-to-close backdrop.
 *
 * Subscribes via `useStudentAssignments` to two channels (active + ended)
 * per supported session kind, and resolves class names / teacher names via
 * `useStudentClassDirectory`.
 *
 * PII guarantees still hold: only the opaque pseudonym uid + claim-bound
 * classIds are read on the client. Teacher names are surfaced (org data,
 * not student PII). The student's own name is never shown — claims don't
 * carry it.
 *
 * Active vs Completed partition is computed client-side from the lazy
 * completion check on each row. See AssignmentSections for the rule.
 */

const REFOCUS_RESELECT_MS = 10 * 60 * 1000;

const FILTER_STORAGE_KEY = 'sb_my_assignments_filter';

const isFilterMode = (v: unknown): v is AssignmentFilterMode =>
  v === 'active' || v === 'completed';

const formatTodayLong = (now: Date): string =>
  now.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

const MyAssignmentsPage: React.FC = () => {
  const { classIds, pseudonymUid, firstName, signOut } = useStudentAuth();

  const directory = useStudentClassDirectory({ classIds, pseudonymUid });
  const landingV2 = useStudentLandingV2Enabled(pseudonymUid);
  const bell = useStudentBellSchedules(landingV2 === true);
  const classes = useMemo(
    () =>
      landingV2
        ? sortClassesByBell(directory.classes, bell.scheduleFor)
        : directory.classes,
    [landingV2, directory.classes, bell.scheduleFor]
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

  const gradesEnabled = useStudentGradebookEnabled();
  const [initialPath] = useState(() =>
    typeof window === 'undefined'
      ? parseMyAssignmentsPath('')
      : parseMyAssignmentsPath(window.location.pathname)
  );

  // Active class selection — null = "All classes" overview.
  const [activeClassId, setActiveClassId] = useState<string | null>(
    initialPath.classId
  );
  const [classTab, setClassTab] = useState<StudentClassTab>(initialPath.tab);

  // A class from the URL or a tap is the student's pick; auto-select never overrides it.
  const [picked, setPicked] = useState(initialPath.classId !== null);
  const [autoSelectDone, setAutoSelectDone] = useState(false);
  const autoSelectReady =
    landingV2 !== null &&
    directory.status === 'ready' &&
    (landingV2 === false || bell.status !== 'loading');
  if (autoSelectReady && !autoSelectDone) {
    setAutoSelectDone(true);
    if (landingV2 && !picked) {
      setActiveClassId(
        pickClassInSession(classes, bell.scheduleFor, getServerNow())
      );
    }
  }
  const hiddenAtRef = useRef<number | null>(null);
  const reselectOnRefocus = landingV2 === true && !picked;
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
      setClassTab('assignments');
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
  const handleTabChange = useCallback(
    (tab: StudentClassTab) => {
      setClassTab(tab);
      syncPath(activeClassId, tab);
    },
    [activeClassId, syncPath]
  );

  // Slide-out sidebar visibility. Defaults open on desktop, closed on mobile
  // — once the student toggles, we respect their choice. Initial state is
  // derived from the viewport at first render and never auto-snaps back.
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });
  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  // On mobile, picking a class auto-closes the sidebar so the student lands
  // on the chosen view immediately. Desktop keeps it open across navigations.
  const handleSelectClass = useCallback(
    (classId: string | null) => {
      setPicked(true);
      setActiveClassId(classId);
      setClassTab('assignments');
      syncPath(classId, 'assignments');
      if (
        typeof window !== 'undefined' &&
        !window.matchMedia('(min-width: 768px)').matches
      ) {
        setSidebarOpen(false);
      }
    },
    [syncPath]
  );

  // Hamburger-button ref so we can restore focus when the sidebar closes.
  // The closed sidebar is `inert`, which means any focus left inside its
  // subtree at close time would be stranded — restoring to the trigger is
  // the standard a11y pattern (matches WAI-ARIA disclosure / dialog
  // recommendations).
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const prevSidebarOpenRef = useRef(sidebarOpen);
  useEffect(() => {
    if (prevSidebarOpenRef.current && !sidebarOpen) {
      menuButtonRef.current?.focus();
    }
    prevSidebarOpenRef.current = sidebarOpen;
  }, [sidebarOpen]);

  // Esc closes the sidebar. Mounted only while open so we don't add an
  // always-on listener for what is otherwise a quiet page.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  // Filter mode persists to sessionStorage so a refresh keeps it but the
  // choice never follows the student onto a shared device.
  const [filterMode, setFilterMode] = useState<AssignmentFilterMode>(() => {
    if (typeof window === 'undefined') return 'active';
    try {
      const raw = window.sessionStorage.getItem(FILTER_STORAGE_KEY);
      return isFilterMode(raw) ? raw : 'active';
    } catch {
      return 'active';
    }
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(FILTER_STORAGE_KEY, filterMode);
    } catch {
      // Ignored — sessionStorage may be disabled by privacy mode.
    }
  }, [filterMode]);

  // If the student picks a class that vanishes from claims (e.g., schedule
  // change mid-session), treat the selection as null so the page never
  // shows an empty "phantom" class. Computed during render rather than via
  // an effect — keeps setState out of effect bodies and avoids a stale
  // intermediate render where the user sees a class that's no longer in
  // their roster.
  const activeClassEntry =
    activeClassId && classIds.includes(activeClassId)
      ? directory.byId[activeClassId]
      : undefined;
  const effectiveClassId = activeClassEntry ? activeClassEntry.classId : null;

  // Per-row completion resolutions, fed from AssignmentListItem callbacks.
  // Stored at the page level so changing classes / filter modes doesn't
  // discard already-resolved checks.
  const [completionMap, setCompletionMap] = useState<
    Record<string, CompletionState>
  >({});
  const onCompletionResolved = useCallback(
    (
      sessionId: string,
      kind: AssignmentSummary['kind'],
      completion: CompletionState
    ) => {
      setCompletionMap((prev) => {
        const key = `${kind}:${sessionId}`;
        if (prev[key] === completion) return prev;
        return { ...prev, [key]: completion };
      });
    },
    []
  );

  // Computed inline rather than memoized — `toLocaleDateString` is cheap
  // and the empty-deps memo would otherwise stick to the date the page
  // was first mounted across day transitions.
  const todayDate = formatTodayLong(new Date());

  // Partition assignments according to the rule in the plan. Compute once
  // at the page level and slice per scope (overview vs class) below.
  // Also collects the set of compositeIds for ended-channel rows surfaced
  // optimistically (completion still 'unknown') so the list rows can render
  // a muted "Checking…" visual instead of looking like a real Completed
  // entry until the per-row check confirms participation.
  const partitioned = useMemo(() => {
    const active: AssignmentSummary[] = [];
    const completed: AssignmentSummary[] = [];
    const pendingVerificationKeys = new Set<string>();
    // M17 C2 (§3a-C): a window-closed assignment merges into Completed
    // (muted+lock treatment) even when the student never submitted —
    // computed once per render against server-offset "now", never a live
    // countdown (Design Contract §4).
    const nowMs = getServerNow();
    for (const a of assignments) {
      const completion = isClosedProjectRun(a)
        ? 'completed'
        : (completionMap[`${a.kind}:${a.sessionId}`] ?? 'unknown');
      if (completion === 'completed') {
        completed.push(a);
        continue;
      }
      if (getWindowState(a, nowMs) === 'closed') {
        completed.push(a);
        continue;
      }
      if (a.channel === 'ended') {
        // Surface ended-channel rows in Completed while the per-row
        // completion check is still resolving. The check only fires when
        // AssignmentListItem mounts, so filtering 'unknown' rows out here
        // would prevent the check from ever running and a participating
        // student's completed assignment would stay hidden forever even
        // though their response doc exists. Once the check resolves to
        // 'not-completed' (student wasn't part of this session), the row
        // drops out on the next pass.
        if (completion === 'not-completed') continue;
        completed.push(a);
        pendingVerificationKeys.add(a.compositeId);
        continue;
      }
      active.push(a);
    }
    return { active, completed, pendingVerificationKeys };
  }, [assignments, completionMap]);

  // Per-class slices. Multi-class assignments appear under each matching
  // class because `assignment.classIds` is the intersection with the
  // student's claims (computed in useStudentAssignments). The pending-
  // verification key set is invariant under class slicing — keying by
  // compositeId makes filtering a no-op — so the same set is reused for
  // every scope.
  const slicedForClass = useCallback(
    (classId: string | null) => {
      if (classId === null) {
        return partitioned;
      }
      const inClass = (a: AssignmentSummary) => a.classIds.includes(classId);
      return {
        active: partitioned.active.filter(inClass),
        completed: partitioned.completed.filter(inClass),
        pendingVerificationKeys: partitioned.pendingVerificationKeys,
      };
    },
    [partitioned]
  );

  const activeCountByClassId = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const c of classIds) out[c] = 0;
    for (const a of partitioned.active) {
      for (const cid of a.classIds) {
        if (cid in out) out[cid] = (out[cid] ?? 0) + 1;
      }
    }
    return out;
  }, [partitioned.active, classIds]);

  const visibleScope = slicedForClass(effectiveClassId);

  const handleDone = useCallback(() => {
    void signOut();
  }, [signOut]);

  // ────────── Loading / no-classes / error gates (top-level guards) ──────────
  if (
    loadState === 'loading' ||
    directory.status === 'loading' ||
    landingV2 === null ||
    (landingV2 && bell.status === 'loading')
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

  // ────────── Main layout — slide-out sidebar + main column ──────────
  return (
    <>
      <SlideOutSidebar open={sidebarOpen} onClose={closeSidebar}>
        <StudentSidebar
          classes={classes}
          activeClassId={effectiveClassId}
          activeCountByClassId={activeCountByClassId}
          totalActiveCount={partitioned.active.length}
          onSelect={handleSelectClass}
          onSignOut={handleDone}
          firstName={firstName}
          classCount={directory.classes.length}
        />
      </SlideOutSidebar>

      <StudentPageShell
        onDone={handleDone}
        onToggleMenu={toggleSidebar}
        menuOpen={sidebarOpen}
        menuButtonRef={menuButtonRef}
        hideDoneButton
      >
        {hasErrors && <PartialFailureBanner onRetry={retry} className="mb-4" />}
        {!activeClassEntry ? (
          <StudentOverview
            todayDate={todayDate}
            active={visibleScope.active}
            completed={visibleScope.completed}
            filterMode={filterMode}
            onFilterChange={setFilterMode}
            pseudonymUid={pseudonymUid}
            directoryById={directory.byId}
            onCompletionResolved={onCompletionResolved}
            pendingVerificationKeys={visibleScope.pendingVerificationKeys}
          />
        ) : (
          <StudentClassView
            key={activeClassEntry.classId}
            classId={activeClassEntry.classId}
            classEntry={activeClassEntry}
            todayDate={todayDate}
            active={visibleScope.active}
            completed={visibleScope.completed}
            filterMode={filterMode}
            onFilterChange={setFilterMode}
            pseudonymUid={pseudonymUid}
            directoryById={directory.byId}
            onCompletionResolved={onCompletionResolved}
            pendingVerificationKeys={visibleScope.pendingVerificationKeys}
            gradesEnabled={gradesEnabled}
            tab={classTab}
            onTabChange={handleTabChange}
          />
        )}
      </StudentPageShell>
    </>
  );
};

// ---------------------------------------------------------------------------
// Page shell (background, header, footer)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Slide-out sidebar wrapper
// ---------------------------------------------------------------------------
//
// On desktop (≥ md), the sidebar is fixed to the left edge of the viewport
// and the page shell adds `md:pl-[280px]` when open so content reflows
// alongside the panel rather than disappearing under it. On mobile, the
// sidebar slides in over the content with a tap-to-close backdrop.

interface SlideOutSidebarProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

// Header heights kept in sync with the `<header>` in PageShell. Used to
// position the sidebar so it slides IN UNDER the header, leaving the
// hamburger and Done button anchored.
const HEADER_OFFSET_CLASSES = 'top-[72px] sm:top-[80px]';

const SlideOutSidebar: React.FC<SlideOutSidebarProps> = ({
  open,
  onClose,
  children,
}) => (
  <>
    {open && (
      <button
        type="button"
        onClick={onClose}
        aria-label="Close class menu"
        className={`fixed bottom-0 left-0 right-0 z-20 bg-slate-900/30 backdrop-blur-sm md:hidden ${HEADER_OFFSET_CLASSES}`}
      />
    )}
    <aside
      aria-label="Class navigation"
      aria-hidden={!open}
      // `inert` removes the entire subtree from focus order, click events,
      // and the a11y tree without unmounting it (preserves scroll/state on
      // toggle). `pointer-events-none` hardens against older browsers that
      // don't yet honor `inert` (Chromium ≥ 102, Safari ≥ 15.5, Firefox ≥
      // 112) so an off-screen sidebar can't intercept clicks.
      {...(open ? {} : { inert: true })}
      className={`fixed bottom-0 left-0 z-20 flex w-[280px] flex-col shadow-xl transition-transform duration-200 ease-out md:shadow-none ${HEADER_OFFSET_CLASSES} ${
        open
          ? 'pointer-events-auto translate-x-0'
          : 'pointer-events-none -translate-x-full'
      }`}
    >
      {children}
    </aside>
  </>
);

// ---------------------------------------------------------------------------
// Partial-failure banner — preserved from the previous implementation
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
