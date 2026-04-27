import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  GraduationCap,
  Loader2,
  LogOut,
  Menu,
  RefreshCw,
} from 'lucide-react';
import { APP_NAME } from '@/config/constants';
import { useStudentAuth } from '@/context/useStudentAuth';
import {
  useStudentAssignments,
  type AssignmentSummary,
} from '@/hooks/useStudentAssignments';
import { useStudentClassDirectory } from '@/hooks/useStudentClassDirectory';
import { StudentSidebar } from './StudentSidebar';
import { StudentOverview } from './StudentOverview';
import { StudentClassView } from './StudentClassView';
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

const FILTER_STORAGE_KEY = 'sb_my_assignments_filter';

const isFilterMode = (v: unknown): v is AssignmentFilterMode =>
  v === 'all' || v === 'active' || v === 'completed';

const formatTodayLong = (now: Date): string =>
  now.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

const MyAssignmentsPage: React.FC = () => {
  const { classIds, pseudonymUid, firstName, signOut } = useStudentAuth();

  const directory = useStudentClassDirectory({ classIds, pseudonymUid });
  const { loadState, assignments, hasErrors, retry } = useStudentAssignments({
    classIds,
  });

  // Active class selection — null = "All classes" overview.
  const [activeClassId, setActiveClassId] = useState<string | null>(null);

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
  const handleSelectClass = useCallback((classId: string | null) => {
    setActiveClassId(classId);
    if (
      typeof window !== 'undefined' &&
      !window.matchMedia('(min-width: 768px)').matches
    ) {
      setSidebarOpen(false);
    }
  }, []);

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
    if (typeof window === 'undefined') return 'all';
    try {
      const raw = window.sessionStorage.getItem(FILTER_STORAGE_KEY);
      return isFilterMode(raw) ? raw : 'all';
    } catch {
      return 'all';
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
  const effectiveClassId =
    activeClassId && classIds.includes(activeClassId) ? activeClassId : null;

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
  const partitioned = useMemo(() => {
    const active: AssignmentSummary[] = [];
    const completed: AssignmentSummary[] = [];
    for (const a of assignments) {
      const completion = completionMap[`${a.kind}:${a.sessionId}`] ?? 'unknown';
      if (completion === 'completed') {
        completed.push(a);
        continue;
      }
      if (a.channel === 'ended') {
        // Ended-channel rows the student didn't complete are hidden.
        continue;
      }
      active.push(a);
    }
    return { active, completed };
  }, [assignments, completionMap]);

  // Per-class slices. Multi-class assignments appear under each matching
  // class because `assignment.classIds` is the intersection with the
  // student's claims (computed in useStudentAssignments).
  const slicedForClass = useCallback(
    (classId: string | null) => {
      if (classId === null) {
        return partitioned;
      }
      const inClass = (a: AssignmentSummary) => a.classIds.includes(classId);
      return {
        active: partitioned.active.filter(inClass),
        completed: partitioned.completed.filter(inClass),
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
  if (loadState === 'loading') {
    return (
      <PageShell onDone={handleDone}>
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-brand-blue-primary" />
          <p className="text-sm font-medium">Loading your assignments…</p>
        </div>
      </PageShell>
    );
  }

  if (classIds.length === 0) {
    return (
      <PageShell onDone={handleDone}>
        <FullEmpty
          icon={AlertCircle}
          title="You're not on a roster yet"
          body="If you just started at your school, ask a teacher to sync their roster."
        />
      </PageShell>
    );
  }

  if (assignments.length === 0 && hasErrors) {
    return (
      <PageShell onDone={handleDone}>
        <FullEmpty
          icon={AlertTriangle}
          title="We couldn't load your assignments"
          body="Something went wrong loading your assignments. Refresh and try again."
          tone="error"
          action={{ label: 'Try again', onClick: retry }}
        />
      </PageShell>
    );
  }

  // ────────── Main layout — slide-out sidebar + main column ──────────
  return (
    <>
      <SlideOutSidebar open={sidebarOpen} onClose={closeSidebar}>
        <StudentSidebar
          classes={directory.classes}
          claimedClassIds={classIds}
          activeClassId={effectiveClassId}
          activeCountByClassId={activeCountByClassId}
          totalActiveCount={partitioned.active.length}
          onSelect={handleSelectClass}
          onSignOut={handleDone}
          firstName={firstName}
          classCount={classIds.length}
        />
      </SlideOutSidebar>

      <PageShell
        onDone={handleDone}
        onToggleMenu={toggleSidebar}
        menuOpen={sidebarOpen}
        menuButtonRef={menuButtonRef}
        hideDoneButton
      >
        {hasErrors && <PartialFailureBanner onRetry={retry} className="mb-4" />}
        {effectiveClassId === null ? (
          <StudentOverview
            todayDate={todayDate}
            active={visibleScope.active}
            completed={visibleScope.completed}
            filterMode={filterMode}
            onFilterChange={setFilterMode}
            pseudonymUid={pseudonymUid}
            directoryById={directory.byId}
            onCompletionResolved={onCompletionResolved}
          />
        ) : (
          <StudentClassView
            classId={effectiveClassId}
            classEntry={directory.byId[effectiveClassId]}
            todayDate={todayDate}
            active={visibleScope.active}
            completed={visibleScope.completed}
            filterMode={filterMode}
            onFilterChange={setFilterMode}
            pseudonymUid={pseudonymUid}
            directoryById={directory.byId}
            onCompletionResolved={onCompletionResolved}
          />
        )}
      </PageShell>
    </>
  );
};

// ---------------------------------------------------------------------------
// Page shell (background, header, footer)
// ---------------------------------------------------------------------------

interface PageShellProps {
  onDone: () => void;
  /**
   * When set, the brand icon is replaced with a hamburger menu button that
   * toggles the slide-out class sidebar. Gate paths (loading / no-classes /
   * error) omit it and render the brand chip as before.
   */
  onToggleMenu?: () => void;
  menuOpen?: boolean;
  /**
   * Ref forwarded to the hamburger menu button so the page can restore
   * focus there when the sidebar closes (e.g. via Esc, backdrop tap, or
   * auto-close on class selection). Without this, focus left inside the
   * now-`inert` sidebar would be stranded for keyboard users.
   */
  menuButtonRef?: React.Ref<HTMLButtonElement>;
  /**
   * When true, suppresses the header's Done button. Sign-out lives in the
   * sidebar footer once the student is past the gate paths.
   */
  hideDoneButton?: boolean;
  children: React.ReactNode;
}

const PageShell: React.FC<PageShellProps> = ({
  onDone,
  onToggleMenu,
  menuOpen,
  menuButtonRef,
  hideDoneButton,
  children,
}) => (
  <div className="relative min-h-screen w-screen overflow-x-hidden bg-slate-50 font-sans">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />
    <div className="pointer-events-none absolute left-[-15%] top-[-10%] h-[500px] w-[500px] rounded-full bg-brand-blue-primary/15 blur-[120px]" />
    <div className="pointer-events-none absolute bottom-[-15%] right-[-10%] h-[500px] w-[500px] rounded-full bg-brand-red-primary/10 blur-[120px]" />

    <div className="relative z-10 flex min-h-screen flex-col">
      {/* Header — full-width, anchored. Brand-blue with white text. The
          hamburger never shifts when the sidebar opens; the sidebar slides
          in *below* this header (top: PAGE_HEADER_HEIGHT). */}
      <header className="relative z-30 flex h-[72px] shrink-0 items-center justify-between gap-4 bg-gradient-to-r from-brand-blue-primary to-brand-blue-dark px-4 text-white shadow-md shadow-brand-blue-primary/20 sm:h-[80px] sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          {onToggleMenu ? (
            <button
              ref={menuButtonRef}
              type="button"
              onClick={onToggleMenu}
              aria-label={menuOpen ? 'Close class menu' : 'Open class menu'}
              aria-expanded={menuOpen}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white shadow-sm transition hover:border-white/30 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-blue-primary"
            >
              <Menu className="h-5 w-5" strokeWidth={2.25} />
            </button>
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 shadow-sm ring-1 ring-white/20">
              <GraduationCap className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
          )}
          <span className="truncate text-lg font-bold tracking-tight text-white sm:text-xl">
            {APP_NAME}
          </span>
        </div>
        {!hideDoneButton && (
          <button
            type="button"
            onClick={onDone}
            aria-label="Done — sign out"
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-white/30 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-blue-primary"
          >
            <LogOut className="h-4 w-4" strokeWidth={2.25} />
            <span>Done</span>
          </button>
        )}
      </header>

      {/* Body — pushed right when sidebar is open on desktop. The header
          above stays anchored. */}
      <div
        className={`flex flex-1 flex-col transition-[padding] duration-200 ${
          onToggleMenu && menuOpen ? 'md:pl-[280px]' : ''
        }`}
      >
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 sm:py-12">
          {children}
        </div>

        <footer className="mx-auto w-full max-w-6xl px-4 pb-6 text-center text-xs font-medium text-slate-400 sm:px-8">
          {APP_NAME}
        </footer>
      </div>
    </div>
  </div>
);

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
